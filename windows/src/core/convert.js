'use strict';

const fs = require('fs/promises');
const path = require('path');
const sharp = require('sharp');
const heic = require('./heic');
const exif = require('./exif');
const { isHeic, isSupported } = require('./discovery');
const { clamp, outputPath } = require('./settings');

class ConversionError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConversionError';
  }
}

const unreadable = (file) =>
  new ConversionError(`Não foi possível ler ${path.basename(file)} — o arquivo pode estar corrompido.`);

/**
 * Abre a imagem já na orientação certa e em sRGB.
 * O EXIF de JPEG e PNG vem pelo próprio sharp (`keepExif`); o de HEIC precisa ser
 * extraído à parte, porque ali os pixels entram crus e o sharp não vê o original.
 */
async function open(input, preserveMetadata) {
  if (isHeic(input)) {
    const buffer = await fs.readFile(input);
    try {
      const opened = await heic.open(buffer);
      const block = preserveMetadata ? exif.withUprightOrientation(heic.exifBlock(buffer)) : null;
      return { ...opened, exifBlock: block };
    } catch {
      throw unreadable(input);
    }
  }

  let metadata;
  try {
    metadata = await sharp(input).metadata();
  } catch {
    throw unreadable(input);
  }
  // Orientações 5 a 8 giram 90°: largura e altura trocam depois do `rotate()`.
  const turned = (metadata.orientation || 1) >= 5;
  // `rotate()` sem ângulo aplica a orientação do EXIF e zera a tag, para o
  // visualizador não girar a imagem de novo.
  const image = sharp(input, { failOn: 'error' }).rotate();
  if (preserveMetadata) image.keepExif();
  return {
    image,
    width: turned ? metadata.height : metadata.width,
    height: turned ? metadata.width : metadata.height,
    exifBlock: null,
  };
}

async function fileSize(file) {
  try {
    return (await fs.stat(file)).size;
  } catch {
    return 0;
  }
}

/**
 * Converte um arquivo para um destino já resolvido.
 * @param {import('./watermark').Watermark | null} watermark carregada uma vez para o lote todo
 */
async function convertFile(input, output, settings, watermark = null) {
  if (!isSupported(input)) throw new ConversionError(`Formato não suportado: ${path.basename(input)}`);

  const originalBytes = await fileSize(input);
  if (!settings.overwrite) {
    try {
      await fs.access(output);
      return { input, output, originalBytes, convertedBytes: await fileSize(output), skipped: true };
    } catch {
      // Não existe: segue para a conversão.
    }
  }

  const directory = path.dirname(output);
  try {
    await fs.mkdir(directory, { recursive: true });
  } catch (error) {
    throw new ConversionError(`Não foi possível criar a pasta ${directory}: ${error.message}`);
  }

  const { image, width, height, exifBlock } = await open(input, settings.preserveMetadata);
  if (watermark) image.composite(await watermark.layers(width, height));

  let data;
  try {
    // Imagens opacas saem sem canal alfa mesmo passando RGBA: a própria libwebp
    // descarta o plano de transparência quando ele é todo opaco.
    data = await image
      .webp({ quality: clamp(settings.quality, 0, 100), effort: clamp(settings.method, 0, 6), alphaQuality: 100 })
      .toBuffer();
  } catch {
    throw unreadable(input);
  }
  if (exifBlock) data = exif.injectExif(data, exifBlock);

  // Grava num temporário e renomeia: um lote cancelado ou uma queda de energia
  // nunca deixam um .webp pela metade com o nome final.
  const temporary = path.join(directory, `.${path.basename(output)}.${process.pid}.tmp`);
  try {
    await fs.writeFile(temporary, data);
    await fs.rename(temporary, output);
  } catch (error) {
    await fs.rm(temporary, { force: true });
    throw new ConversionError(`Não foi possível gravar ${path.basename(output)}: ${error.message}`);
  }

  if (settings.preserveMetadata) {
    // Mantém a foto na mesma posição cronológica do Explorador e das galerias.
    try {
      const { atime, mtime } = await fs.stat(input);
      await fs.utimes(output, atime, mtime);
    } catch {
      // Datas são um extra: não vale falhar a conversão por elas.
    }
  }

  return { input, output, originalBytes, convertedBytes: data.length, skipped: false };
}

/**
 * Converte usando o destino padrão (`webp/<nome>.webp`), carregando a marca
 * d'água das configurações se houver. Num lote, prefira `runBatch`, que carrega
 * a marca uma vez só.
 */
async function convert(input, settings) {
  const { Watermark } = require('./watermark');
  const watermark = settings.watermark ? await Watermark.load(settings.watermark.imagePath, settings.watermark) : null;
  return convertFile(input, outputPath(input, settings), settings, watermark);
}

module.exports = { convertFile, convert, open, ConversionError };
