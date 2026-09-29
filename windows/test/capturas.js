'use strict';

// Fotografa cada estado da interface, sem abrir janela na tela.
// Uso: npm run capturas   (as imagens vão para capturas/, ou para $CAPTURAS_DIR)
//
// Opcional, para prévias realistas: CAPTURAS_MARCA=<imagem da marca> e
// CAPTURAS_AMOSTRAS=<imagens separadas por ; ou :>.

const fs = require('fs');
const path = require('path');
const { app, BrowserWindow, ipcMain, nativeTheme } = require('electron');
const sharp = require('sharp');
const { Watermark } = require('../src/core/watermark');
const { renderPreview } = require('../src/core/preview');

const FIXTURES = path.join(__dirname, 'fixtures');
const RENDERER = path.join(__dirname, '..', 'src', 'renderer');
const OUT = process.env.CAPTURAS_DIR || path.join(__dirname, '..', 'capturas');
const MARK = process.env.CAPTURAS_MARCA || path.join(FIXTURES, 'marca-teste.png');
const SAMPLES = process.env.CAPTURAS_AMOSTRAS
  ? process.env.CAPTURAS_AMOSTRAS.split(path.delimiter)
  : ['foto-exif.jpg', 'logo-transparente.png', 'foto-p3.jpg'].map((f) => path.join(FIXTURES, f));

const MAIN = { page: 'index.html', width: 560, height: 680 };
const SHEET = { page: 'marca.html', width: 720, height: 580 };
const clickConvert = 'document.querySelector("[data-action=convert]").click()';

const SCENARIOS = [
  { name: '01-vazio', ...MAIN },
  { name: '02-lista', ...MAIN },
  { name: '03-avancadas', ...MAIN, script: 'document.getElementById("advanced-toggle").click()' },
  { name: '04-marca-ativa', ...MAIN },
  { name: '05-convertendo', ...MAIN, script: clickConvert },
  { name: '06-concluido', ...MAIN, script: `${clickConvert}; setTimeout(() => document.querySelector("[data-action=toggle-failures]").click(), 150)` },
  { name: '07-marca-janela', ...SHEET },
  { name: '08-escuro-lista', ...MAIN, dark: true },
  { name: '09-escuro-concluido', ...MAIN, dark: true, script: clickConvert },
  { name: '10-escuro-marca-janela', ...SHEET, dark: true },
];

let markCache = null;
const mark = async () => (markCache ??= await Watermark.load(MARK));

ipcMain.handle('demo-watermark-info', async () => {
  const loaded = await mark();
  const thumbnail = await sharp(loaded.png).resize({ width: 168, height: 96, fit: 'inside' }).png().toBuffer();
  return {
    thumbnail: `data:image/png;base64,${thumbnail.toString('base64')}`,
    width: loaded.width,
    height: loaded.height,
    hasTransparency: await loaded.hasTransparency(),
  };
});
ipcMain.handle('demo-samples', () => SAMPLES);
ipcMain.handle('demo-preview', async (_event, sample, style) => {
  const image = await renderPreview(sample, (await mark()).withStyle(style));
  return `data:image/webp;base64,${image.toString('base64')}`;
});
ipcMain.handle('demo-file-icon', async (_event, file) => {
  // Os caminhos de demonstração não existem: pede o ícone de um arquivo real do mesmo tipo.
  const sample = { jpg: 'foto-exif.jpg', png: 'logo-transparente.png', heic: 'foto.heic' }[file.split('.').pop()];
  try {
    return (await app.getFileIcon(path.join(FIXTURES, sample), { size: 'small' })).toDataURL();
  } catch {
    return null;
  }
});

async function waitFor(window, expression, timeout = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await window.webContents.executeJavaScript(`Boolean(${expression})`)) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`tempo esgotado esperando: ${expression}`);
}

/**
 * Uma única janela para todas as capturas, trocando página, tamanho e tema: além de
 * mais rápido, funciona em ambientes que proíbem abrir vários processos de
 * renderização (como terminais com isolamento de segurança).
 */
function createWindow() {
  const window = new BrowserWindow({
    width: MAIN.width,
    height: MAIN.height,
    useContentSize: true,
    show: false,
    webPreferences: {
      offscreen: true,
      preload: path.join(__dirname, 'demo-preload.js'),
      contextIsolation: true,
      sandbox: true,
    },
  });
  window.webContents.on('console-message', (details) => {
    if (details.level === 'error' || details.level === 'warning') console.log(`    [console] ${details.message}`);
  });
  window.webContents.on('render-process-gone', (_event, details) => console.log(`    [renderer encerrado] ${details.reason}`));
  window.webContents.on('preload-error', (_event, _file, error) => console.log(`    [preload] ${error.message}`));
  return window;
}

async function capture(window, scenario) {
  nativeTheme.themeSource = scenario.dark ? 'dark' : 'light';
  window.setBackgroundColor(scenario.dark ? '#202020' : '#ffffff');
  window.setContentSize(scenario.width, scenario.height);
  await window.loadFile(path.join(RENDERER, scenario.page), { query: { cenario: scenario.name } });
  await waitFor(window, 'document.body.dataset.ready === "true"');
  if (scenario.page === 'marca.html') await waitFor(window, '!document.getElementById("preview").hidden');
  if (scenario.script) await window.webContents.executeJavaScript(scenario.script);
  await new Promise((resolve) => setTimeout(resolve, 600));
  const image = await window.webContents.capturePage();
  fs.writeFileSync(path.join(OUT, `${scenario.name}.png`), image.toPNG());
  console.log(`  ✓ ${scenario.name}.png (${image.getSize().width}×${image.getSize().height})`);
}

app.dock?.hide();
app.whenReady().then(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  console.log(`Capturas em ${OUT}`);
  try {
    const window = createWindow();
    for (const scenario of SCENARIOS) await capture(window, scenario);
    app.exit(0);
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
});
