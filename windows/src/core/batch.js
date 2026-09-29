'use strict';

const os = require('os');
const path = require('path');
const { convertFile } = require('./convert');
const { planOutputs } = require('./planner');
const { Watermark } = require('./watermark');

/**
 * Converte uma lista de arquivos usando todos os núcleos disponíveis.
 *
 * Os "trabalhadores" puxam de um índice compartilhado em vez de dividir a lista
 * em blocos fixos: as imagens variam muito de tamanho, e um bloco cheio de fotos
 * de 40 MP deixaria os outros núcleos ociosos no fim.
 *
 * Lança `WatermarkError` antes de começar se a marca d'água não abrir — melhor um
 * erro claro do que o mesmo erro repetido em cada imagem.
 *
 * @param {string[]} inputs
 * @param {import('./settings').ConversionSettings} settings
 * @param {{concurrency?: number, onProgress?: Function, signal?: AbortSignal}} options
 */
async function runBatch(inputs, settings, { concurrency = os.availableParallelism(), onProgress, signal } = {}) {
  const summary = {
    converted: 0,
    skipped: 0,
    originalBytes: 0,
    convertedBytes: 0,
    failures: [],
    cancelled: false,
  };
  if (inputs.length === 0) return summary;

  const watermark = settings.watermark
    ? await Watermark.load(settings.watermark.imagePath, settings.watermark)
    : null;

  // Resolver os destinos antes de começar evita que dois arquivos de mesmo nome e
  // extensões diferentes disputem o mesmo .webp.
  const plans = planOutputs(inputs, settings);
  let cursor = 0;
  let completed = 0;

  async function worker() {
    while (cursor < plans.length) {
      if (signal?.aborted) {
        summary.cancelled = true;
        return;
      }
      const plan = plans[cursor++];
      try {
        const result = await convertFile(plan.input, plan.output, settings, watermark);
        if (result.skipped) {
          summary.skipped += 1;
        } else {
          summary.converted += 1;
          summary.originalBytes += result.originalBytes;
          summary.convertedBytes += result.convertedBytes;
        }
      } catch (error) {
        summary.failures.push({ input: plan.input, message: error.message });
      }
      completed += 1;
      onProgress?.({
        completed,
        total: plans.length,
        currentFile: path.basename(plan.input),
        originalBytes: summary.originalBytes,
        convertedBytes: summary.convertedBytes,
      });
    }
  }

  const workers = Math.max(1, Math.min(concurrency, plans.length));
  await Promise.all(Array.from({ length: workers }, worker));
  if (signal?.aborted) summary.cancelled = true;
  return summary;
}

/** Fração economizada, de 0 a 1. */
const savedFraction = (s) => (s.originalBytes > 0 ? Math.max(0, s.originalBytes - s.convertedBytes) / s.originalBytes : 0);

module.exports = { runBatch, savedFraction };
