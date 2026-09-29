'use strict';

const path = require('path');
const { parse, UsageError, EarlyExit, TOOL } = require('./args');
const { expand } = require('../core/discovery');
const { runBatch, savedFraction } = require('../core/batch');
const { version } = require('../../package.json');

/** Tamanho de arquivo no formato brasileiro, em unidades decimais como no macOS. */
function formatBytes(bytes) {
  const number = (value, digits) =>
    value.toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  if (bytes < 1000) return `${bytes} bytes`;
  if (bytes < 1e6) return `${number(Math.round(bytes / 1e3), 0)} KB`;
  if (bytes < 1e9) return `${number(bytes / 1e6, 1)} MB`;
  return `${number(bytes / 1e9, 2)} GB`;
}

function summaryLines(summary) {
  const report = [];
  if (summary.converted > 0) {
    const percent = Math.round(savedFraction(summary) * 100);
    report.push(`${summary.converted} convertida(s): ${formatBytes(summary.originalBytes)} → ${formatBytes(summary.convertedBytes)} (−${percent}%)`);
  }
  if (summary.skipped > 0) report.push(`${summary.skipped} já existia(m)`);
  if (summary.failures.length > 0) report.push(`${summary.failures.length} falhou(aram)`);
  return report;
}

/**
 * Executa o conversor com argumentos de linha de comando.
 *
 * @param {string[]} argv
 * @param {{notify?: (title: string, body: string) => Promise<void> | void, stdout?: NodeJS.WriteStream, stderr?: NodeJS.WriteStream}} io
 *   `notify` só existe quando quem chama sabe exibir notificações (o app, a partir
 *   dos atalhos do Explorador); no terminal a saída já é o aviso.
 * @returns {Promise<number>} código de saída: 0 ok, 1 erro de uso, 2 alguma imagem falhou
 */
async function main(argv, { notify, stdout = process.stdout, stderr = process.stderr } = {}) {
  const wantsNotification = argv.includes('--notificar') || argv.includes('--notify');
  const warn = (text) => stderr.write(text);

  // Vindo de um atalho do Explorador não há terminal onde a mensagem apareça,
  // então a falha também vira notificação.
  const abort = async (message) => {
    if (wantsNotification && notify) await notify('Conversão não realizada', message);
    warn(`${TOOL}: ${message}\n`);
    return 1;
  };

  let options;
  try {
    options = parse(argv, version);
  } catch (error) {
    if (error instanceof EarlyExit) {
      stdout.write(`${error.output}\n`);
      return 0;
    }
    if (error instanceof UsageError && error.isHelp) {
      stdout.write(`${error.message}\n`);
      return 1;
    }
    if (error instanceof UsageError) return abort(error.message);
    throw error;
  }

  const files = await expand(options.inputs.map((input) => path.resolve(input)), options.settings.outputFolderName);
  if (files.length === 0) return abort('nenhuma imagem JPEG, PNG ou HEIC encontrada nos caminhos informados.');

  const showsProgress = !options.quiet && Boolean(stderr.isTTY);
  if (!options.quiet) {
    const plural = files.length === 1 ? 'imagem' : 'imagens';
    const mark = options.settings.watermark ? ' e marca d\'água' : '';
    warn(`Convertendo ${files.length} ${plural} com qualidade ${Math.round(options.settings.quality)}${mark}…\n`);
  }

  let summary;
  try {
    summary = await runBatch(files, options.settings, {
      concurrency: options.jobs,
      onProgress: (progress) => {
        if (!showsProgress) return;
        const line = `  ${progress.completed}/${progress.total}  ${progress.currentFile}`;
        warn(`\r\x1b[K${line.slice(0, 110)}`);
      },
    });
  } catch (error) {
    if (showsProgress) warn('\r\x1b[K');
    return abort(error.message);
  }
  if (showsProgress) warn('\r\x1b[K');

  const report = summaryLines(summary);
  if (!options.quiet) stdout.write(`${report.length ? report.join(' · ') : 'Nada a fazer.'}\n`);
  for (const failure of summary.failures) {
    warn(`  ✗ ${path.basename(failure.input)}: ${failure.message}\n`);
  }

  if (options.notify) {
    const title = summary.failures.length ? 'Conversão concluída com erros' : 'Conversão concluída';
    const body = report.length ? report.join(' · ') : 'Nada a fazer.';
    if (notify) await notify(title, body);
    else if (!options.quiet) warn('(notificações só aparecem quando a conversão parte do app ou do menu Enviar para)\n');
  }

  return summary.failures.length ? 2 : 0;
}

module.exports = { main, formatBytes, summaryLines };
