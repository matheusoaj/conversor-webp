'use strict';

const os = require('os');
const path = require('path');

/**
 * Onde ficam as preferências e a cópia da marca d'água. O app e a linha de
 * comando usam a mesma pasta — é assim que `webpify --amostra` enxerga a marca
 * escolhida na janela.
 *
 * No Windows é `%APPDATA%\Conversor WebP`. Em qualquer outro sistema (só em
 * desenvolvimento) o nome é outro de propósito: no macOS, `Conversor WebP` é a
 * pasta do app nativo, e os testes não podem mexer na marca guardada por ele.
 */
function dataDirectory() {
  if (process.env.CONVERSOR_WEBP_DADOS) return process.env.CONVERSOR_WEBP_DADOS;
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    return path.join(appData, 'Conversor WebP');
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'Conversor WebP para Windows');
  }
  const config = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  return path.join(config, 'conversor-webp');
}

const preferencesPath = () => path.join(dataDirectory(), 'preferencias.json');
const watermarkStorePath = () => path.join(dataDirectory(), 'marca-dagua.png');

module.exports = { dataDirectory, preferencesPath, watermarkStorePath };
