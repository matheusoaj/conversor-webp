'use strict';

// A ponte entre a interface e o sistema. A janela não tem acesso direto ao
// Node: só às funções listadas aqui.

const { contextBridge, ipcRenderer, webUtils } = require('electron');

const EVENTS = new Set(['progress', 'add-files', 'accent-color', 'preferences-changed', 'watermark-changed']);

contextBridge.exposeInMainWorld('conversor', {
  init: () => ipcRenderer.invoke('init'),
  dialogInit: () => ipcRenderer.invoke('dialog-init'),

  /** Caminho real de um arquivo solto na janela. */
  pathForFile: (file) => webUtils.getPathForFile(file),
  chooseFiles: () => ipcRenderer.invoke('choose-files'),
  chooseFolder: () => ipcRenderer.invoke('choose-folder'),
  /** Expande arquivos e pastas na lista de imagens, com o tamanho de cada uma. */
  expand: (paths, outputFolderName) => ipcRenderer.invoke('expand', paths, outputFolderName),
  /** Ícone que o Windows usa para o tipo de arquivo. */
  fileIcon: (file) => ipcRenderer.invoke('file-icon', file),

  convert: (files, settings) => ipcRenderer.invoke('convert', files, settings),
  cancel: () => ipcRenderer.send('cancel'),
  reveal: (firstFile, settings) => ipcRenderer.send('reveal', firstFile, settings),

  savePreferences: (changes) => ipcRenderer.send('save-preferences', changes),

  chooseWatermark: () => ipcRenderer.invoke('choose-watermark'),
  openWatermarkDialog: (samples) => ipcRenderer.send('open-watermark-dialog', samples),
  renderPreview: (sample, style) => ipcRenderer.invoke('render-preview', sample, style),
  closeWindow: () => ipcRenderer.send('close-window'),

  on(channel, callback) {
    if (!EVENTS.has(channel)) throw new Error(`evento desconhecido: ${channel}`);
    ipcRenderer.on(channel, (_event, ...args) => callback(...args));
  },
});
