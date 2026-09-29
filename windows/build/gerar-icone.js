'use strict';

// Gera build/icon.ico a partir do ícone do app Mac (Tools/MakeIcon, 1024×1024).
// Roda no macOS, onde o desenho é feito; o .ico fica versionado para o build no
// Windows não depender do Swift.
//
// Uso: swift ../Tools/MakeIcon/main.swift /tmp/icone.png && node build/gerar-icone.js /tmp/icone.png

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const source = process.argv[2];
const OUT = path.join(__dirname, 'icon.ico');
// O desenho do Mac tem 8,5% de margem, padrão dos ícones do macOS. No Windows os
// ícones ocupam mais o quadro: corta até sobrar 3%.
const CROP = 0.055;
const SIZES = [16, 20, 24, 32, 40, 48, 64, 128, 256];

/** Entrada BMP de 32 bits com alfa: tamanhos pequenos, que alguns programas do Windows só leem assim. */
async function bmpEntry(image, size) {
  const { data } = await image.clone().resize(size, size).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const header = Buffer.alloc(40);
  header.writeUInt32LE(40, 0);
  header.writeInt32LE(size, 4);
  header.writeInt32LE(size * 2, 8); // altura dobrada: imagem + máscara
  header.writeUInt16LE(1, 12);
  header.writeUInt16LE(32, 14);
  header.writeUInt32LE(size * size * 4, 20);
  const pixels = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const from = (y * size + x) * 4;
      const to = ((size - 1 - y) * size + x) * 4; // BMP guarda as linhas de baixo para cima
      pixels[to] = data[from + 2];
      pixels[to + 1] = data[from + 1];
      pixels[to + 2] = data[from];
      pixels[to + 3] = data[from + 3];
    }
  }
  const maskRow = Math.ceil(size / 32) * 4;
  return Buffer.concat([header, pixels, Buffer.alloc(maskRow * size)]);
}

(async () => {
  const meta = await sharp(source).metadata();
  const inset = Math.round(meta.width * CROP);
  const base = sharp(source).extract({ left: inset, top: inset, width: meta.width - inset * 2, height: meta.height - inset * 2 });

  const images = [];
  for (const size of SIZES) {
    images.push(size <= 48
      ? await bmpEntry(base, size)
      : await base.clone().resize(size, size).png({ compressionLevel: 9 }).toBuffer());
  }

  const directory = Buffer.alloc(6 + 16 * SIZES.length);
  directory.writeUInt16LE(1, 2);
  directory.writeUInt16LE(SIZES.length, 4);
  let offset = directory.length;
  SIZES.forEach((size, i) => {
    const at = 6 + i * 16;
    directory[at] = size >= 256 ? 0 : size;
    directory[at + 1] = size >= 256 ? 0 : size;
    directory.writeUInt16LE(1, at + 4);
    directory.writeUInt16LE(32, at + 6);
    directory.writeUInt32LE(images[i].length, at + 8);
    directory.writeUInt32LE(offset, at + 12);
    offset += images[i].length;
  });

  fs.writeFileSync(OUT, Buffer.concat([directory, ...images]));
  await base.clone().resize(512, 512).png().toFile(path.join(__dirname, 'icon.png'));
  console.log(`${OUT}: ${SIZES.join(', ')} px`);
})();
