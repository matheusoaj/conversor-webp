'use strict';

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { preferencesPath, watermarkStorePath } = require('./paths');
const { Watermark } = require('./watermark');
const { DEFAULT_OPACITY, DEFAULT_OUTPUT_FOLDER, placementById } = require('./settings');

/** As mesmas opções salvas pelo app Mac, com os mesmos valores iniciais. */
const DEFAULTS = {
  quality: 82,
  method: 4,
  preserveMetadata: true,
  overwriteExisting: false,
  outputFolderName: DEFAULT_OUTPUT_FOLDER,
  watermarkEnabled: false,
  watermarkPlacement: 'centro',
  watermarkScale: placementById('centro').defaultScale,
  watermarkOpacity: DEFAULT_OPACITY,
};

function load() {
  try {
    const stored = JSON.parse(fs.readFileSync(preferencesPath(), 'utf8'));
    return { ...DEFAULTS, ...stored };
  } catch {
    return { ...DEFAULTS };
  }
}

/** Grava por cima num temporário e renomeia: um arquivo pela metade viraria preferências perdidas. */
function save(preferences) {
  const file = preferencesPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify({ ...DEFAULTS, ...preferences }, null, 2));
  fs.renameSync(temporary, file);
}

function update(changes) {
  const next = { ...load(), ...changes };
  save(next);
  return next;
}

const hasStoredWatermark = () => fs.existsSync(watermarkStorePath());

/**
 * Valida a imagem escolhida e grava uma cópia em PNG num lugar fixo. PNG porque
 * preserva a transparência de qualquer formato de origem; cópia porque o
 * original pode ser movido ou apagado depois.
 */
async function storeWatermark(source) {
  const mark = await Watermark.load(source);
  const target = watermarkStorePath();
  fs.mkdirSync(path.dirname(target), { recursive: true });
  await sharp(mark.png).png().toFile(`${target}.tmp`);
  fs.renameSync(`${target}.tmp`, target);
  return target;
}

module.exports = { DEFAULTS, load, save, update, hasStoredWatermark, storeWatermark, watermarkStorePath };
