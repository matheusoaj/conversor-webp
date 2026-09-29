'use strict';

const fs = require('fs/promises');
const path = require('path');
const { DEFAULT_OUTPUT_FOLDER, WATERMARK_FOLDER_SUFFIX } = require('./settings');

const SUPPORTED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.jpe', '.jfif', '.png', '.heic', '.heif', '.heics']);
const HEIC_EXTENSIONS = new Set(['.heic', '.heif', '.heics']);

const isSupported = (file) => SUPPORTED_EXTENSIONS.has(path.extname(file).toLowerCase());
const isHeic = (file) => HEIC_EXTENSIONS.has(path.extname(file).toLowerCase());

// Windows e macOS não diferenciam maiúsculas em nomes de arquivo: `Foto.JPG` e
// `foto.jpg` são o mesmo arquivo e não podem entrar duas vezes na lista.
const identity = (file) => path.resolve(file).toLowerCase();

const collator = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' });

/**
 * Expande o que foi solto na janela (ou enviado pelo Explorador) na lista real de
 * imagens a converter. Pastas entram recursivamente.
 */
async function expand(paths, outputFolderName = DEFAULT_OUTPUT_FOLDER) {
  const skipFolders = new Set([
    outputFolderName.toLowerCase(),
    (outputFolderName + WATERMARK_FOLDER_SUFFIX).toLowerCase(),
  ]);
  const found = [];
  const seen = new Set();

  const add = (file) => {
    const key = identity(file);
    if (!seen.has(key)) {
      seen.add(key);
      found.push(path.resolve(file));
    }
  };

  async function walk(directory) {
    let entries;
    try {
      entries = await fs.readdir(directory, { withFileTypes: true });
    } catch {
      return; // Pasta sem permissão de leitura: ignora em vez de abortar o lote.
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name.startsWith('$')) continue;
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        // Não reprocessa o que já foi convertido antes, com ou sem marca.
        if (!skipFolders.has(entry.name.toLowerCase())) await walk(full);
      } else if (entry.isFile() && isSupported(entry.name)) {
        add(full);
      }
    }
  }

  for (const item of paths) {
    let stats;
    try {
      stats = await fs.stat(item);
    } catch {
      continue;
    }
    if (stats.isDirectory()) await walk(item);
    else if (stats.isFile() && isSupported(item)) add(item);
  }

  return found.sort((a, b) => collator.compare(a, b));
}

async function totalSize(files) {
  let total = 0;
  for (const file of files) {
    try {
      total += (await fs.stat(file)).size;
    } catch {
      // Arquivo sumiu entre a varredura e a soma: só não conta.
    }
  }
  return total;
}

module.exports = { SUPPORTED_EXTENSIONS, isSupported, isHeic, identity, expand, totalSize };
