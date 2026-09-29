'use strict';

const fs = require('fs/promises');
const sharp = require('sharp');
const heic = require('./heic');
const { isHeic } = require('./discovery');

/** Miniatura já endireitada; guarda a última, porque a prévia redesenha a cada ajuste de slider. */
const thumbnails = { key: null, value: null };

async function thumbnail(sample, maxPixelSize) {
  const key = `${sample}@${maxPixelSize}`;
  if (thumbnails.key !== key) {
    const image = isHeic(sample) ? (await heic.open(await fs.readFile(sample))).image : sharp(sample, { failOn: 'error' }).rotate();
    const value = await image
      .resize({ width: maxPixelSize, height: maxPixelSize, fit: 'inside', withoutEnlargement: true })
      .png()
      .toBuffer({ resolveWithObject: true });
    thumbnails.key = key;
    thumbnails.value = value;
  }
  return thumbnails.value;
}

/** Sem imagem de exemplo, uma página A4 em degradê do claro ao escuro: marcas brancas e pretas aparecem em alguma parte. */
function placeholder(size) {
  const width = Math.round(size / 1.414);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${size}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#e0e0e0"/><stop offset="1" stop-color="#525252"/>
    </linearGradient></defs>
    <rect width="100%" height="100%" fill="url(#g)"/></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer({ resolveWithObject: true });
}

/**
 * A prévia do app: a mesma rotina de desenho do lote, sobre uma miniatura — como o
 * tamanho da marca é proporcional à imagem, o que aparece é o que sai.
 * Sai em WebP: bem menor que PNG para trafegar até a janela, e mantém transparência.
 */
async function renderPreview(sample, watermark, maxPixelSize = 900) {
  let base = null;
  if (sample) {
    try {
      base = await thumbnail(sample, maxPixelSize);
    } catch {
      base = null; // Imagem ilegível: mostra a página de exemplo em vez de erro.
    }
  }
  base ??= await placeholder(maxPixelSize);
  const { width, height } = base.info;
  return sharp(base.data).composite(await watermark.layers(width, height)).webp({ quality: 85 }).toBuffer();
}

module.exports = { renderPreview };
