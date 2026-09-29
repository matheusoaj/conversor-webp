'use strict';

const zlib = require('zlib');
const sharp = require('sharp');
const decode = require('heic-decode');

// O HEIC é um contêiner ISOBMFF (o mesmo do MP4): uma árvore de "caixas" com
// tamanho e tipo. Aqui só se lê o necessário — onde está o EXIF e qual é o
// perfil de cor —, e os pixels ficam com o decodificador libheif.

function readUInt(buf, at, bytes) {
  switch (bytes) {
    case 0: return 0;
    case 1: return buf[at];
    case 2: return buf.readUInt16BE(at);
    case 4: return buf.readUInt32BE(at);
    case 8: return Number(buf.readBigUInt64BE(at));
    default: throw new Error(`tamanho de campo inválido: ${bytes}`);
  }
}

function boxes(buf, start, end) {
  const list = [];
  let at = start;
  while (at + 8 <= end) {
    let size = buf.readUInt32BE(at);
    const type = buf.toString('latin1', at + 4, at + 8);
    let header = 8;
    if (size === 1) {
      if (at + 16 > end) break;
      size = Number(buf.readBigUInt64BE(at + 8));
      header = 16;
    } else if (size === 0) {
      size = end - at;
    }
    if (size < header || at + size > end) break;
    list.push({ type, dataStart: at + header, end: at + size });
    at += size;
  }
  return list;
}

function metaChildren(buf) {
  const meta = boxes(buf, 0, buf.length).find((box) => box.type === 'meta');
  return meta ? boxes(buf, meta.dataStart + 4, meta.end) : []; // meta é FullBox
}

const isTiff = (b) =>
  b.length >= 8 &&
  ((b[0] === 0x49 && b[1] === 0x49 && b[2] === 0x2a && b[3] === 0) ||
    (b[0] === 0x4d && b[1] === 0x4d && b[2] === 0 && b[3] === 0x2a));

/**
 * O bloco EXIF (TIFF) de um HEIC. No HEIF o EXIF é um "item" do contêiner:
 * `iinf` diz qual item é do tipo Exif e `iloc` diz onde estão os bytes dele.
 */
function exifBlock(buf) {
  try {
    const children = metaChildren(buf);
    const iinf = children.find((box) => box.type === 'iinf');
    const iloc = children.find((box) => box.type === 'iloc');
    const idat = children.find((box) => box.type === 'idat');
    if (!iinf || !iloc) return null;

    let at = iinf.dataStart;
    at += 4 + (buf[at] === 0 ? 2 : 4);
    let exifItem = null;
    for (const infe of boxes(buf, at, iinf.end)) {
      if (infe.type !== 'infe') continue;
      let p = infe.dataStart;
      const version = buf[p];
      p += 4;
      if (version < 2) continue;
      const itemId = version === 2 ? buf.readUInt16BE(p) : buf.readUInt32BE(p);
      p += (version === 2 ? 2 : 4) + 2; // + item_protection_index
      if (buf.toString('latin1', p, p + 4) === 'Exif') {
        exifItem = itemId;
        break;
      }
    }
    if (exifItem === null) return null;

    at = iloc.dataStart;
    const version = buf[at];
    at += 4;
    const offsetSize = buf[at] >> 4;
    const lengthSize = buf[at] & 0x0f;
    const baseOffsetSize = buf[at + 1] >> 4;
    const indexSize = version === 1 || version === 2 ? buf[at + 1] & 0x0f : 0;
    at += 2;
    const itemCount = version < 2 ? buf.readUInt16BE(at) : buf.readUInt32BE(at);
    at += version < 2 ? 2 : 4;

    for (let i = 0; i < itemCount; i++) {
      const itemId = version < 2 ? buf.readUInt16BE(at) : buf.readUInt32BE(at);
      at += version < 2 ? 2 : 4;
      let construction = 0;
      if (version === 1 || version === 2) {
        construction = buf.readUInt16BE(at) & 0x0f;
        at += 2;
      }
      at += 2; // data_reference_index
      const baseOffset = readUInt(buf, at, baseOffsetSize);
      at += baseOffsetSize;
      const extentCount = buf.readUInt16BE(at);
      at += 2;
      const extents = [];
      for (let e = 0; e < extentCount; e++) {
        at += indexSize;
        const offset = readUInt(buf, at, offsetSize);
        at += offsetSize;
        const length = readUInt(buf, at, lengthSize);
        at += lengthSize;
        extents.push({ offset, length });
      }
      if (itemId !== exifItem) continue;

      // Método 0: posição no arquivo; 1: posição dentro da caixa `idat`.
      let origin;
      if (construction === 0) origin = 0;
      else if (construction === 1 && idat) origin = idat.dataStart;
      else return null;

      const data = Buffer.concat(
        extents.map(({ offset, length }) => {
          const start = origin + baseOffset + offset;
          return buf.subarray(start, length ? start + length : buf.length);
        }),
      );
      if (data.length < 4) return null;
      // Os 4 primeiros bytes dizem quanto pular até o cabeçalho TIFF
      // (normalmente os 6 de "Exif\0\0").
      const tiff = data.subarray(4 + data.readUInt32BE(0));
      return isTiff(tiff) ? Buffer.from(tiff) : null;
    }
    return null;
  } catch {
    return null; // Contêiner malformado: segue sem metadados em vez de falhar.
  }
}

/**
 * O perfil de cor declarado na caixa `colr`: o arquivo ICC completo (`prof`), ou
 * só um código de cores primárias (`nclx`) — 12 é o Display P3 dos iPhones.
 * @returns {{icc: Buffer} | {primaries: number} | null}
 */
function colorProfile(buf) {
  try {
    const iprp = metaChildren(buf).find((box) => box.type === 'iprp');
    if (!iprp) return null;
    const ipco = boxes(buf, iprp.dataStart, iprp.end).find((box) => box.type === 'ipco');
    if (!ipco) return null;
    let nclx = null;
    for (const colr of boxes(buf, ipco.dataStart, ipco.end)) {
      if (colr.type !== 'colr') continue;
      const kind = buf.toString('latin1', colr.dataStart, colr.dataStart + 4);
      if (kind === 'prof' || kind === 'rICC') {
        return { icc: Buffer.from(buf.subarray(colr.dataStart + 4, colr.end)) };
      }
      if (kind === 'nclx' && !nclx) nclx = { primaries: buf.readUInt16BE(colr.dataStart + 4) };
    }
    return nclx;
  } catch {
    return null;
  }
}

let p3Profile = null;
/** O perfil Display P3 que acompanha o sharp, para HEIC que só declara o código. */
async function displayP3Profile() {
  if (!p3Profile) {
    const png = await sharp({ create: { width: 1, height: 1, channels: 3, background: '#000' } })
      .withIccProfile('p3')
      .png()
      .toBuffer();
    p3Profile = (await sharp(png).metadata()).icc;
  }
  return p3Profile;
}

function pngChunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'latin1');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32(Buffer.concat([head.subarray(4), data])) >>> 0, 0);
  return Buffer.concat([head, data, crc]);
}

/** Insere um perfil ICC (chunk iCCP) logo depois do cabeçalho IHDR de um PNG. */
function pngWithIcc(png, icc) {
  const afterIhdr = 8 + 8 + 13 + 4; // assinatura + (tamanho, tipo, 13 bytes, CRC)
  const iccp = pngChunk('iCCP', Buffer.concat([Buffer.from('ICC\0\0', 'latin1'), zlib.deflateSync(icc)]));
  return Buffer.concat([png.subarray(0, afterIhdr), iccp, png.subarray(afterIhdr)]);
}

/**
 * Decodifica um HEIC já na orientação certa (a libheif aplica as transformações
 * do contêiner) e com as cores convertidas para sRGB.
 *
 * A libheif entrega os números crus, no espaço de cor da foto — em iPhones,
 * Display P3. O sharp não aceita um perfil de entrada para pixels crus, então
 * eles passam por um PNG sem compressão com o perfil embutido: assim o sharp
 * converte as cores com a mesma rotina que usa para um JPEG em P3.
 *
 * @returns {Promise<{image: import('sharp').Sharp, width: number, height: number}>}
 */
async function open(buf) {
  const decoded = await decode({ buffer: buf });
  const { width, height } = decoded;
  const pixels = Buffer.from(decoded.data.buffer, decoded.data.byteOffset, decoded.data.byteLength);
  const raw = { raw: { width, height, channels: 4 } };

  const profile = colorProfile(buf);
  const icc = profile?.icc ?? (profile?.primaries === 12 ? await displayP3Profile() : null);
  if (!icc) return { image: sharp(pixels, raw), width, height };

  const png = await sharp(pixels, raw).png({ compressionLevel: 0, adaptiveFiltering: false }).toBuffer();
  return { image: sharp(pngWithIcc(png, icc)), width, height };
}

module.exports = { exifBlock, colorProfile, open };
