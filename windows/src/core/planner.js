'use strict';

const path = require('path');
const { outputDirectory, outputPath } = require('./settings');

// O Windows não diferencia maiúsculas: `Foto.webp` e `foto.webp` são o mesmo
// destino e precisam ser tratados como disputa.
const key = (file) => path.resolve(file).toLowerCase();

/**
 * Decide o destino de cada arquivo antes da conversão começar.
 *
 * `foto.jpg` e `foto.png` na mesma pasta virariam ambos `webp/foto.webp`, e um
 * sobrescreveria o outro. Quando isso acontece, os dois recebem o sufixo da
 * extensão original (`foto-jpg.webp`, `foto-png.webp`) — ninguém "ganha" o nome
 * limpo por acaso de ordenação.
 *
 * @returns {{input: string, output: string}[]} na mesma ordem da entrada
 */
function planOutputs(inputs, settings) {
  const groups = new Map();
  for (const input of inputs) {
    const target = key(outputPath(input, settings));
    if (!groups.has(target)) groups.set(target, []);
    groups.get(target).push(input);
  }

  const plans = new Map();
  const taken = new Set();

  // Primeiro os nomes sem disputa: um arquivo chamado `foto-jpg.png` já é dono
  // de `foto-jpg.webp` e não pode perder o nome para um desempate.
  for (const [target, contenders] of groups) {
    if (contenders.length === 1) {
      plans.set(contenders[0], outputPath(contenders[0], settings));
      taken.add(target);
    }
  }

  for (const contenders of groups.values()) {
    if (contenders.length === 1) continue;

    const directory = outputDirectory(contenders[0], settings);
    for (const input of contenders) {
      const base = path.basename(input, path.extname(input));
      const suffix = path.extname(input).slice(1).toLowerCase();
      let candidate = path.join(directory, `${suffix ? `${base}-${suffix}` : base}.webp`);

      // Rede de segurança: `foto.JPG` e `foto.jpg` chegariam ao mesmo sufixo.
      let counter = 2;
      while (taken.has(key(candidate))) {
        candidate = path.join(directory, `${base}-${suffix}-${counter}.webp`);
        counter += 1;
      }
      taken.add(key(candidate));
      plans.set(input, candidate);
    }
  }

  return inputs.map((input) => ({ input, output: plans.get(input) }));
}

module.exports = { planOutputs };
