'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  app, BrowserWindow, dialog, ipcMain, Menu, nativeTheme, Notification, shell, systemPreferences, utilityProcess,
} = require('electron');
const { dataDirectory } = require('../core/paths');

const APP_ID = 'com.matheusoaj.conversorwebp';
const MOTOR = path.join(__dirname, 'motor.js');
const WEBPIFY = path.join(__dirname, '..', 'cli', 'webpify.js');
const PRELOAD = path.join(__dirname, 'preload.js');
const RENDERER = path.join(__dirname, '..', 'renderer');
// O sharp converte cada imagem num fio do libuv; o padrão de 4 fios deixaria
// metade dos núcleos parada.
const THREADPOOL = String(Math.max(4, os.availableParallelism()));
// Teste de ponta a ponta (test/e2e.js): o app roda de verdade, mas desenha fora
// da tela, para ser conduzido e fotografado sem janela visível.
const E2E = process.env.CONVERSOR_WEBP_E2E === '1';

app.setPath('userData', dataDirectory());
app.setAppUserModelId(APP_ID);

const background = () => (nativeTheme.shouldUseDarkColors ? '#202020' : '#ffffff');

// --- Modo sem janela: menu "Enviar para" do Explorador ----------------------------

/**
 * `Conversor WebP.exe --converter --preset media <arquivos>` converte e avisa por
 * notificação, sem abrir janela — o equivalente às Ações Rápidas do Finder.
 * A conversão roda a própria linha de comando num processo à parte.
 */
function runHeadless(args) {
  app.whenReady().then(() => {
    const pending = [];
    const child = utilityProcess.fork(WEBPIFY, args, {
      env: { ...process.env, UV_THREADPOOL_SIZE: THREADPOOL, CONVERSOR_WEBP_NOTIFICAR: '1' },
      stdio: 'ignore',
      serviceName: 'Conversor WebP',
    });
    child.on('message', (message) => {
      if (message?.type === 'notify') pending.push(showNotification(message.title, message.body));
    });
    child.on('exit', async (code) => {
      await Promise.all(pending);
      app.exit(code ?? 1);
    });
  });
}

/** Resolve depois de o Windows receber a notificação, para o app poder encerrar. */
function showNotification(title, body) {
  return new Promise((resolve) => {
    if (!Notification.isSupported()) return resolve();
    const notification = new Notification({ title, body });
    notification.on('show', () => setTimeout(resolve, 1500));
    notification.on('failed', () => resolve());
    notification.show();
    setTimeout(resolve, 6000);
  });
}

// --- Modo com janela ---------------------------------------------------------------

let mainWindow = null;
let watermarkWindow = null;
let motor = null;
let requestId = 0;
const requests = new Map();

/** Caminhos recebidos na abertura: arquivos soltos sobre o ícone, "Abrir com"… */
function launchPaths(argv) {
  const args = argv.slice(app.isPackaged ? 1 : 2);
  return args.filter((arg) => !arg.startsWith('-') && fs.existsSync(arg)).map((arg) => path.resolve(arg));
}

function motorProcess() {
  if (!motor) {
    motor = utilityProcess.fork(MOTOR, [], {
      env: { ...process.env, UV_THREADPOOL_SIZE: THREADPOOL },
      serviceName: 'Conversor WebP — conversão',
    });
    motor.on('message', (message) => {
      const request = requests.get(message.id);
      if (!request) return;
      if (message.type === 'progress') {
        request.onProgress?.(message.progress);
        return;
      }
      requests.delete(message.id);
      if (message.type === 'done') request.resolve(message);
      else request.reject(new Error(message.message));
    });
    motor.on('exit', () => {
      motor = null;
      for (const request of requests.values()) request.reject(new Error('O processo de conversão foi encerrado inesperadamente.'));
      requests.clear();
    });
  }
  return motor;
}

function ask(message, onProgress) {
  const id = ++requestId;
  return new Promise((resolve, reject) => {
    requests.set(id, { resolve, reject, onProgress });
    motorProcess().postMessage({ id, ...message });
  });
}

function accentColor() {
  try {
    return `#${systemPreferences.getAccentColor().slice(0, 6)}`;
  } catch {
    return null; // Sistemas sem cor de destaque: a interface usa o azul do Windows.
  }
}

function broadcast(channel, ...args) {
  for (const window of BrowserWindow.getAllWindows()) window.webContents.send(channel, ...args);
}

function createMainWindow() {
  const window = new BrowserWindow({
    width: 560,
    height: 680,
    minWidth: 520,
    minHeight: 600,
    useContentSize: true,
    title: 'Conversor WebP',
    backgroundColor: background(),
    autoHideMenuBar: true,
    show: false,
    webPreferences: { preload: PRELOAD, contextIsolation: true, sandbox: true, offscreen: E2E },
  });
  window.loadFile(path.join(RENDERER, 'index.html'));
  if (!E2E) window.once('ready-to-show', () => window.show());
  window.on('closed', () => {
    mainWindow = null;
  });
  return window;
}

/** A janela de ajuste da marca: modal, como a folha do app Mac. */
function openWatermarkWindow(samples) {
  if (watermarkWindow) {
    watermarkWindow.focus();
    return;
  }
  watermarkWindow = new BrowserWindow({
    parent: mainWindow,
    modal: true,
    width: 720,
    height: 580,
    useContentSize: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    title: 'Marca d\'água de amostra',
    backgroundColor: background(),
    autoHideMenuBar: true,
    show: false,
    webPreferences: { preload: PRELOAD, contextIsolation: true, sandbox: true },
  });
  watermarkWindow.samples = samples;
  watermarkWindow.loadFile(path.join(RENDERER, 'marca.html'));
  watermarkWindow.once('ready-to-show', () => watermarkWindow.show());
  watermarkWindow.on('closed', () => {
    watermarkWindow = null;
  });
}

function registerIpc() {
  const core = {
    preferences: require('../core/preferences'),
    discovery: require('../core/discovery'),
    settings: require('../core/settings'),
  };
  const watermarkInfo = require('./watermark-info');
  const launched = launchPaths(process.argv);

  ipcMain.handle('init', async () => ({
    preferences: core.preferences.load(),
    watermark: await watermarkInfo.current(),
    accentColor: accentColor(),
    version: app.getVersion(),
    launchPaths: launched.splice(0),
  }));

  ipcMain.handle('dialog-init', async (event) => ({
    preferences: core.preferences.load(),
    watermark: await watermarkInfo.current(),
    accentColor: accentColor(),
    samples: BrowserWindow.fromWebContents(event.sender)?.samples ?? [],
  }));

  ipcMain.handle('choose-files', async (event) => {
    const result = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), {
      title: 'Escolha imagens para converter',
      buttonLabel: 'Adicionar',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Imagens (JPEG, PNG, HEIC)', extensions: ['jpg', 'jpeg', 'jpe', 'jfif', 'png', 'heic', 'heif'] }],
    });
    return result.canceled ? [] : result.filePaths;
  });

  // No Windows um mesmo diálogo não escolhe arquivos e pastas ao mesmo tempo.
  ipcMain.handle('choose-folder', async (event) => {
    const result = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), {
      title: 'Escolha pastas para converter',
      buttonLabel: 'Adicionar',
      properties: ['openDirectory', 'multiSelections'],
    });
    return result.canceled ? [] : result.filePaths;
  });

  ipcMain.handle('expand', async (_event, paths, outputFolderName) => {
    const files = await core.discovery.expand(paths, outputFolderName);
    const sized = await Promise.all(
      files.map(async (file) => ({ path: file, size: await fs.promises.stat(file).then((s) => s.size, () => 0) })),
    );
    return sized;
  });

  ipcMain.handle('convert', async (event, files, settings) => {
    const resolved = { ...settings };
    if (settings.watermark) {
      resolved.watermark = { ...settings.watermark, imagePath: core.preferences.watermarkStorePath() };
    }
    try {
      const { summary } = await ask({ type: 'convert', files, settings: resolved }, (progress) => {
        if (!event.sender.isDestroyed()) event.sender.send('progress', progress);
      });
      return { summary };
    } catch (error) {
      return { error: error.message };
    }
  });

  ipcMain.on('cancel', () => motor?.postMessage({ type: 'cancel' }));

  ipcMain.on('reveal', (_event, firstFile, settings) => {
    const directory = core.settings.outputDirectory(firstFile, settings);
    shell.showItemInFolder(fs.existsSync(directory) ? directory : firstFile);
  });

  ipcMain.on('save-preferences', (event, changes) => {
    const preferences = core.preferences.update(changes);
    for (const window of BrowserWindow.getAllWindows()) {
      if (window.webContents !== event.sender) window.webContents.send('preferences-changed', preferences);
    }
  });

  ipcMain.handle('choose-watermark', async (event) => {
    const owner = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(owner, {
      title: 'Escolha a imagem da marca d\'água — de preferência um PNG com fundo transparente',
      buttonLabel: 'Usar Esta Imagem',
      properties: ['openFile'],
      filters: [{ name: 'Imagens', extensions: ['png', 'jpg', 'jpeg', 'webp', 'heic', 'tif', 'tiff'] }],
    });
    if (result.canceled) return null;
    try {
      await core.preferences.storeWatermark(result.filePaths[0]);
    } catch (error) {
      await dialog.showMessageBox(owner, {
        type: 'warning',
        message: 'Não foi possível usar esta imagem',
        detail: error.message,
      });
      return null;
    }
    const info = await watermarkInfo.current({ refresh: true });
    broadcast('watermark-changed', info);
    return info;
  });

  ipcMain.handle('file-icon', async (_event, file) => {
    try {
      return (await app.getFileIcon(file, { size: 'small' })).toDataURL();
    } catch {
      return null;
    }
  });

  ipcMain.on('open-watermark-dialog', (_event, samples) => openWatermarkWindow(samples));
  ipcMain.on('close-window', (event) => BrowserWindow.fromWebContents(event.sender)?.close());

  ipcMain.handle('render-preview', async (_event, sample, style) => {
    try {
      const { dataUrl } = await ask({ type: 'preview', imagePath: core.preferences.watermarkStorePath(), sample, style });
      return dataUrl;
    } catch {
      return null;
    }
  });

  systemPreferences.on?.('accent-color-changed', () => broadcast('accent-color', accentColor()));
}

function runWindowed() {
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return;
  }

  app.on('second-instance', (_event, argv) => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
    const paths = launchPaths(argv);
    if (paths.length) mainWindow.webContents.send('add-files', paths);
  });

  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    registerIpc();
    mainWindow = createMainWindow();
  });

  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', () => motor?.kill());
}

const converterAt = process.argv.indexOf('--converter');
if (converterAt >= 0) runHeadless(process.argv.slice(converterAt + 1));
else runWindowed();
