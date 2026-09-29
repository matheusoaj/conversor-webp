'use strict';

// Processo separado que faz o trabalho pesado: conversões e prévias da marca.
// Decodificar um HEIC trava o processo por alguns instantes; aqui isso não
// congela a janela.

const fs = require('fs');
const { runBatch } = require('../core/batch');
const { Watermark } = require('../core/watermark');
const { renderPreview } = require('../core/preview');

let controller = null;
const loadedMark = { key: null, mark: null };

/** A marca decodificada fica em memória enquanto o arquivo não mudar. */
async function watermarkAt(imagePath) {
  const key = `${imagePath}@${fs.statSync(imagePath).mtimeMs}`;
  if (loadedMark.key !== key) {
    loadedMark.mark = await Watermark.load(imagePath);
    loadedMark.key = key;
  }
  return loadedMark.mark;
}

process.parentPort.on('message', async ({ data: message }) => {
  const reply = (payload) => process.parentPort.postMessage({ id: message.id, ...payload });

  switch (message.type) {
    case 'convert': {
      controller = new AbortController();
      try {
        const summary = await runBatch(message.files, message.settings, {
          signal: controller.signal,
          onProgress: (progress) => reply({ type: 'progress', progress }),
        });
        reply({ type: 'done', summary });
      } catch (error) {
        reply({ type: 'error', message: error.message });
      } finally {
        controller = null;
      }
      break;
    }
    case 'cancel':
      controller?.abort();
      break;
    case 'preview': {
      try {
        const mark = (await watermarkAt(message.imagePath)).withStyle(message.style);
        const image = await renderPreview(message.sample, mark);
        reply({ type: 'done', dataUrl: `data:image/webp;base64,${image.toString('base64')}` });
      } catch (error) {
        reply({ type: 'error', message: error.message });
      }
      break;
    }
    default:
      reply({ type: 'error', message: `mensagem desconhecida: ${message.type}` });
  }
});
