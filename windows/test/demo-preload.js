'use strict';

// Substitui a ponte do app por dados de demonstração, para fotografar cada estado
// da interface sem depender de arquivos reais. Só o roteiro de capturas usa isto.

const { contextBridge, ipcRenderer } = require('electron');

const scenario = new URLSearchParams(location.search).get('cenario') || 'vazio';
const has = (word) => scenario.includes(word);
const listeners = {};

const FOLDER = 'C:\\Users\\Matheus\\Imagens\\Catálogo 2026';
const EXTENSIONS = ['jpg', 'jpg', 'jpg', 'png', 'heic'];
const files = Array.from({ length: 247 }, (_, i) => ({
  path: `${FOLDER}\\${i % 9 === 4 ? 'Coleção Inverno\\' : ''}produto-${String(i + 1).padStart(3, '0')}.${EXTENSIONS[i % EXTENSIONS.length]}`,
  size: 520000 + ((i * 7919) % 900000),
}));

const withFiles = !has('vazio');
const preferences = {
  quality: 82,
  method: 4,
  preserveMetadata: true,
  overwriteExisting: false,
  outputFolderName: 'webp',
  watermarkEnabled: has('marca'),
  watermarkPlacement: 'centro',
  watermarkScale: 0.6,
  watermarkOpacity: 0.4,
};

contextBridge.exposeInMainWorld('conversor', {
  init: async () => ({
    preferences,
    watermark: has('marca') ? await ipcRenderer.invoke('demo-watermark-info') : null,
    accentColor: '#0078d4',
    version: 'demo',
    launchPaths: withFiles ? files.map((f) => f.path) : [],
  }),
  dialogInit: async () => ({
    preferences: { ...preferences, watermarkEnabled: true },
    watermark: await ipcRenderer.invoke('demo-watermark-info'),
    accentColor: '#0078d4',
    samples: await ipcRenderer.invoke('demo-samples'),
  }),
  pathForFile: () => null,
  chooseFiles: async () => [],
  chooseFolder: async () => [],
  expand: async (paths) => files.filter((f) => paths.includes(f.path)),
  fileIcon: (file) => ipcRenderer.invoke('demo-file-icon', file),
  convert: () => new Promise((resolve) => {
    if (has('convertendo')) {
      setTimeout(() => listeners.progress?.({
        completed: 147, total: 247, currentFile: 'produto-148.jpg', originalBytes: 109800000, convertedBytes: 24600000,
      }), 50);
      return; // fica "convertendo" para a foto
    }
    setTimeout(() => resolve({
      summary: {
        converted: 244,
        skipped: 2,
        failures: [{ input: `${FOLDER}\\quebrado.jpg`, message: 'Não foi possível ler quebrado.jpg — o arquivo pode estar corrompido.' }],
        originalBytes: 184300000,
        convertedBytes: 31200000,
        cancelled: false,
      },
    }), 50);
  }),
  cancel() {},
  reveal() {},
  savePreferences() {},
  chooseWatermark: async () => null,
  openWatermarkDialog() {},
  renderPreview: (sample, style) => ipcRenderer.invoke('demo-preview', sample, style),
  closeWindow() {},
  on(channel, callback) {
    listeners[channel] = callback;
  },
});
