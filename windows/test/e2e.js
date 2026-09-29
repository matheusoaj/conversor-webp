'use strict';

// Teste de ponta a ponta: abre o app de verdade (janela, ponte, motor de
// conversão) sem mostrar nada na tela, converte uma pasta clicando nos botões da
// própria interface e confere os arquivos gravados.
//
// Uso: electron test/e2e.js <pasta de trabalho vazia>

const fs = require('fs');
const os = require('os');
const path = require('path');

const workdir = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'conversor-webp-e2e-')));
const FIXTURES = path.join(__dirname, 'fixtures');
const IMAGES = ['foto-exif.jpg', 'foto-girada.jpg', 'foto.heic', 'logo-transparente.png', 'quebrado.jpg'];

fs.mkdirSync(workdir, { recursive: true });
for (const name of IMAGES) fs.copyFileSync(path.join(FIXTURES, name), path.join(workdir, name));

process.env.CONVERSOR_WEBP_E2E = '1';
process.env.CONVERSOR_WEBP_DADOS ??= fs.mkdtempSync(path.join(os.tmpdir(), 'conversor-webp-e2e-dados-'));
// A pasta de trabalho chega como se tivesse sido solta sobre o ícone do app.
process.argv = [process.argv[0], __filename, workdir];

const { app, BrowserWindow } = require('electron');
require('../src/main/main.js');

const failures = [];
const check = (label, ok, detail = '') => {
  console.log(`${ok ? '✓' : '✗ FALHA'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(label);
};

async function waitFor(window, expression, timeout = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await window.webContents.executeJavaScript(`Boolean(${expression})`).catch(() => false)) return true;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`tempo esgotado esperando: ${expression}`);
}

async function snapshot(window, name) {
  if (!process.env.CAPTURAS_DIR) return;
  fs.mkdirSync(process.env.CAPTURAS_DIR, { recursive: true });
  const image = await window.webContents.capturePage();
  fs.writeFileSync(path.join(process.env.CAPTURAS_DIR, `${name}.png`), image.toPNG());
}

app.dock?.hide();
app.whenReady().then(async () => {
  try {
    let window;
    while (!(window = BrowserWindow.getAllWindows()[0])) await new Promise((resolve) => setTimeout(resolve, 50));

    await waitFor(window, 'document.querySelector(".file-list")');
    const listed = await window.webContents.executeJavaScript('document.querySelectorAll(".file-row").length');
    check('a pasta solta no ícone vira lista de imagens', listed === IMAGES.length, `${listed} de ${IMAGES.length}`);
    await snapshot(window, 'e2e-1-lista');

    await window.webContents.executeJavaScript('document.querySelector("[data-action=convert]").click()');
    await waitFor(window, 'document.querySelector(".summary")');
    const title = await window.webContents.executeJavaScript('document.querySelector(".summary h1").textContent');
    check('o resumo aparece ao terminar', title === '4 imagens convertidas', title);
    await window.webContents.executeJavaScript('document.querySelector("[data-action=toggle-failures]")?.click()');
    await new Promise((resolve) => setTimeout(resolve, 300));
    await snapshot(window, 'e2e-2-concluido');

    const output = path.join(workdir, 'webp');
    const written = fs.existsSync(output) ? fs.readdirSync(output).sort() : [];
    check('os .webp foram gravados na pasta webp', written.length === 4, written.join(', '));
    const failed = await window.webContents.executeJavaScript('document.querySelector(".failures")?.textContent || ""');
    check('a falha do arquivo corrompido aparece no resumo', failed.includes('quebrado.jpg'));
  } catch (error) {
    check('o teste chegou ao fim', false, error.message);
  }
  console.log(failures.length ? `\n${failures.length} FALHA(S)` : '\nTUDO OK');
  app.exit(failures.length ? 1 : 0);
});
