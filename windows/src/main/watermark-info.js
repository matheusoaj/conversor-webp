'use strict';

const fs = require('fs');
const sharp = require('sharp');
const { watermarkStorePath } = require('../core/paths');
const { Watermark } = require('../core/watermark');

let cached = { key: null, info: null };

/**
 * A marca guardada, resumida para a interface: miniatura, dimensões e se tem
 * transparência. Fica em cache até o arquivo mudar.
 * @returns {Promise<{thumbnail: string, width: number, height: number, hasTransparency: boolean} | null>}
 */
async function current({ refresh = false } = {}) {
  const file = watermarkStorePath();
  let stats;
  try {
    stats = fs.statSync(file);
  } catch {
    cached = { key: null, info: null };
    return null;
  }
  const key = String(stats.mtimeMs);
  if (!refresh && cached.key === key) return cached.info;

  try {
    const mark = await Watermark.load(file);
    const thumbnail = await sharp(mark.png).resize({ width: 168, height: 96, fit: 'inside' }).png().toBuffer();
    const info = {
      thumbnail: `data:image/png;base64,${thumbnail.toString('base64')}`,
      width: mark.width,
      height: mark.height,
      hasTransparency: await mark.hasTransparency(),
    };
    cached = { key, info };
    return info;
  } catch {
    return null;
  }
}

module.exports = { current };
