'use strict';

const path = require('path');

/** Os três atalhos de qualidade — os mesmos valores e textos do app Mac. */
const QUALITY_PRESETS = [
  { id: 'alta', title: 'Alta', quality: 90, subtitle: 'Preserva detalhe fino; ideal para impressão e portfólio.' },
  { id: 'media', title: 'Média', quality: 82, subtitle: 'O equilíbrio para web e e-commerce. Recomendado.' },
  { id: 'leve', title: 'Leve', quality: 70, subtitle: 'Arquivos bem menores; ótimo para miniaturas e catálogos.' },
];

/** Onde a marca d'água vai em cada imagem. */
const WATERMARK_PLACEMENTS = [
  // Uma marca repetida precisa ser bem menor que uma única no centro, senão
  // vira uma parede — por isso cada posição tem seu tamanho inicial.
  { id: 'centro', title: 'Centro', defaultScale: 0.6 },
  { id: 'repetida', title: 'Repetida', defaultScale: 0.28 },
  { id: 'canto', title: 'Canto', defaultScale: 0.22 },
];

const DEFAULT_OUTPUT_FOLDER = 'webp';
/**
 * As versões com marca vão para uma pasta própria (`webp-amostra/`): assim nunca
 * se misturam com as limpas, e uma não é pulada por já existir a outra.
 */
const WATERMARK_FOLDER_SUFFIX = '-amostra';
const DEFAULT_OPACITY = 0.4;

function presetById(id) {
  const normalized = String(id).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  return QUALITY_PRESETS.find((preset) => preset.id === normalized) || null;
}

/** O preset cujo valor bate com `quality`, se houver algum. */
function presetMatching(quality) {
  return QUALITY_PRESETS.find((preset) => Math.abs(preset.quality - quality) < 0.5) || null;
}

function placementById(id) {
  const normalized = String(id).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  return WATERMARK_PLACEMENTS.find((placement) => placement.id === normalized) || null;
}

function watermarkStyle({ placement = 'centro', scale, opacity = DEFAULT_OPACITY } = {}) {
  const resolved = placementById(placement) || WATERMARK_PLACEMENTS[0];
  return {
    placement: resolved.id,
    scale: scale == null ? resolved.defaultScale : scale,
    opacity,
  };
}

/**
 * @typedef {object} ConversionSettings
 * @property {number} quality 0–100. Acima de ~95 o arquivo cresce muito com pouco ganho visível.
 * @property {number} method Esforço do compressor, 0–6. Mais alto comprime melhor e demora mais.
 * @property {boolean} preserveMetadata Copia o EXIF (data, câmera, GPS) do original.
 * @property {string} outputFolderName Nome da subpasta criada ao lado do original.
 * @property {boolean} overwrite Regrava `.webp` já existentes em vez de pular.
 * @property {{imagePath: string, placement: string, scale: number, opacity: number} | null} watermark
 */

/** @returns {ConversionSettings} */
function defaultSettings(overrides = {}) {
  return {
    quality: 82,
    method: 4,
    preserveMetadata: true,
    outputFolderName: DEFAULT_OUTPUT_FOLDER,
    overwrite: false,
    watermark: null,
    ...overrides,
  };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value)));
}

/** O nome efetivo da subpasta: `webp`, ou `webp-amostra` quando há marca d'água. */
function resolvedOutputFolderName(settings) {
  const folder = String(settings.outputFolderName || '').trim();
  const base = folder || DEFAULT_OUTPUT_FOLDER;
  return settings.watermark ? base + WATERMARK_FOLDER_SUFFIX : base;
}

/** A pasta de saída para um arquivo: `<pasta do original>/webp/`. */
function outputDirectory(input, settings) {
  return path.join(path.dirname(input), resolvedOutputFolderName(settings));
}

/** O destino padrão: `<pasta do original>/webp/<nome>.webp`. */
function outputPath(input, settings) {
  const base = path.basename(input, path.extname(input));
  return path.join(outputDirectory(input, settings), `${base}.webp`);
}

module.exports = {
  QUALITY_PRESETS,
  WATERMARK_PLACEMENTS,
  DEFAULT_OUTPUT_FOLDER,
  WATERMARK_FOLDER_SUFFIX,
  DEFAULT_OPACITY,
  presetById,
  presetMatching,
  placementById,
  watermarkStyle,
  defaultSettings,
  clamp,
  resolvedOutputFolderName,
  outputDirectory,
  outputPath,
};
