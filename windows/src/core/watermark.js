'use strict';

const sharp = require('sharp');
const { clamp, watermarkStyle } = require('./settings');

/** Acima disso só se gasta memória: mesmo numa foto de 12 MP a marca raramente passa de 3000 px. */
const MAX_PIXEL_SIZE = 3000;

class WatermarkError extends Error {
  constructor(file) {
    super(`Não foi possível abrir a marca d'água ${require('path').basename(file)}. Use uma imagem PNG, JPEG, WebP ou HEIC.`);
    this.name = 'WatermarkError';
  }
}

/**
 * A marca já carregada, pronta para ser aplicada em quantas imagens for.
 * Guarda em cache a última marca redimensionada: num lote as imagens costumam
 * ter todas o mesmo tamanho, e redimensionar a marca a cada uma seria desperdício.
 */
class Watermark {
  /** @param {Buffer} png  @param {number} width  @param {number} height */
  constructor(png, width, height, style) {
    this.png = png;
    this.width = width;
    this.height = height;
    this.style = watermarkStyle(style);
    this.cache = { key: null, tile: null };
  }

  /** Lê a imagem uma vez, já na orientação certa e em sRGB. */
  static async load(file, style) {
    try {
      const { data, info } = await sharp(file, { failOn: 'error' })
        .rotate()
        .resize({ width: MAX_PIXEL_SIZE, height: MAX_PIXEL_SIZE, fit: 'inside', withoutEnlargement: true })
        .ensureAlpha()
        .png()
        .toBuffer({ resolveWithObject: true });
      return new Watermark(data, info.width, info.height, style);
    } catch {
      throw new WatermarkError(file);
    }
  }

  withStyle(style) {
    return new Watermark(this.png, this.width, this.height, style);
  }

  /**
   * Uma marca sem transparência aparece como um retângulo sobre a foto; o app usa
   * isto para avisar antes de alguém converter um lote inteiro assim.
   */
  async hasTransparency() {
    const { isOpaque } = await sharp(this.png).stats();
    return !isOpaque;
  }

  /**
   * A marca cabe numa caixa de `scale` × as dimensões da imagem, sem distorcer —
   * assim o mesmo tamanho funciona em retrato e em paisagem.
   */
  markSize(canvasWidth, canvasHeight) {
    const scale = clamp(this.style.scale, 0.05, 1);
    const aspect = this.width / Math.max(1, this.height);
    let width = canvasWidth * scale;
    let height = width / aspect;
    if (height > canvasHeight * scale) {
      height = canvasHeight * scale;
      width = height * aspect;
    }
    return { width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)) };
  }

  /** Posições (canto superior esquerdo) onde a marca é desenhada. */
  frames(canvasWidth, canvasHeight, size) {
    switch (this.style.placement) {
      case 'canto': {
        const margin = Math.round(Math.min(canvasWidth, canvasHeight) * 0.03);
        return [{ left: canvasWidth - size.width - margin, top: canvasHeight - size.height - margin }];
      }
      case 'repetida':
        return tiledFrames(canvasWidth, canvasHeight, size);
      default:
        return [{
          left: Math.round((canvasWidth - size.width) / 2),
          top: Math.round((canvasHeight - size.height) / 2),
        }];
    }
  }

  /** A marca no tamanho pedido, com a opacidade já aplicada ao canal alfa. */
  async tile(size) {
    const opacity = clamp(this.style.opacity, 0.05, 1);
    const key = `${size.width}x${size.height}@${opacity}`;
    if (this.cache.key !== key) {
      const alpha = Math.round(255 * opacity);
      this.cache = {
        key,
        tile: await sharp(this.png)
          .resize(size.width, size.height, { fit: 'fill' })
          // "dest-in" multiplica o alfa da marca pelo deste pixel: é a opacidade.
          .composite([{ input: Buffer.from([255, 255, 255, alpha]), raw: { width: 1, height: 1, channels: 4 }, tile: true, blend: 'dest-in' }])
          .png()
          .toBuffer(),
      };
    }
    return this.cache.tile;
  }

  /** Camadas prontas para `sharp().composite()` sobre uma imagem de width×height. */
  async layers(canvasWidth, canvasHeight) {
    const size = this.markSize(canvasWidth, canvasHeight);
    const tile = await this.tile(size);
    return this.frames(canvasWidth, canvasHeight, size).map(({ left, top }) => ({ input: tile, left, top }));
  }
}

/**
 * Grade em tijolinho (linhas alternadas deslocadas meio passo), centrada na
 * imagem para as bordas saírem simétricas.
 */
function tiledFrames(canvasWidth, canvasHeight, size) {
  const gap = Math.max(size.width, size.height) * 0.4;
  const stepX = size.width + gap;
  const stepY = size.height + gap;
  const columns = Math.ceil(canvasWidth / stepX) + 1;
  const rows = Math.ceil(canvasHeight / stepY) + 1;
  const originX = (canvasWidth - size.width) / 2;
  const originY = (canvasHeight - size.height) / 2;

  const frames = [];
  for (let row = -rows; row <= rows; row++) {
    const shift = row % 2 === 0 ? 0 : stepX / 2;
    for (let column = -columns; column <= columns; column++) {
      const left = Math.round(originX + column * stepX + shift);
      const top = Math.round(originY + row * stepY);
      const visible = left < canvasWidth && top < canvasHeight && left + size.width > 0 && top + size.height > 0;
      if (visible) frames.push({ left, top });
    }
  }
  return frames;
}

module.exports = { Watermark, WatermarkError, MAX_PIXEL_SIZE };
