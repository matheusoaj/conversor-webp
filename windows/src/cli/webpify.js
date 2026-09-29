#!/usr/bin/env node
'use strict';

// O sharp roda cada conversão num fio do libuv, que por padrão tem só 4. Precisa
// ser definido antes de qualquer operação assíncrona criar esse conjunto de fios.
process.env.UV_THREADPOOL_SIZE ??= String(Math.max(4, require('os').availableParallelism()));

const { main } = require('./run');

// Chamada pelo app a partir do menu "Enviar para" do Explorador: não há terminal,
// então quem mostra o resultado é uma notificação do Windows, exibida pelo app.
const notify = process.parentPort && process.env.CONVERSOR_WEBP_NOTIFICAR
  ? (title, body) => process.parentPort.postMessage({ type: 'notify', title, body })
  : undefined;

main(process.argv.slice(2), { notify }).then(
  (code) => process.exit(code),
  (error) => {
    process.stderr.write(`webpify: ${error.stack || error.message}\n`);
    process.exit(1);
  },
);
