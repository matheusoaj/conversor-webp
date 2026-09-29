'use strict';

// EXIF é um bloco TIFF: cabeçalho "II*\0" (little-endian) ou "MM\0*" (big-endian),
// seguido de diretórios (IFDs) de entradas de 12 bytes.

const TAG_ORIENTATION = 0x0112;
const TAG_EXIF_IFD = 0x8769;
const TAG_GPS_IFD = 0x8825;
const TYPE_SIZES = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };

function isTiff(buf) {
  return (
    buf.length >= 8 &&
    ((buf[0] === 0x49 && buf[1] === 0x49 && buf[2] === 0x2a && buf[3] === 0x00) ||
      (buf[0] === 0x4d && buf[1] === 0x4d && buf[2] === 0x00 && buf[3] === 0x2a))
  );
}

/** Aceita o bloco com ou sem o prefixo "Exif\0\0" herdado do JPEG. */
function toTiff(buf) {
  if (!buf || buf.length < 8) return null;
  if (isTiff(buf)) return buf;
  if (buf.toString('latin1', 0, 6) === 'Exif\0\0' && isTiff(buf.subarray(6))) return buf.subarray(6);
  return null;
}

function reader(tiff) {
  const le = tiff[0] === 0x49;
  return {
    u16: (o) => (le ? tiff.readUInt16LE(o) : tiff.readUInt16BE(o)),
    u32: (o) => (le ? tiff.readUInt32LE(o) : tiff.readUInt32BE(o)),
    i32: (o) => (le ? tiff.readInt32LE(o) : tiff.readInt32BE(o)),
    w16: (value, o) => (le ? tiff.writeUInt16LE(value, o) : tiff.writeUInt16BE(value, o)),
  };
}

function entries(tiff, offset) {
  const r = reader(tiff);
  if (offset + 2 > tiff.length) return [];
  const count = r.u16(offset);
  const list = [];
  for (let i = 0; i < count; i++) {
    const at = offset + 2 + i * 12;
    if (at + 12 > tiff.length) break;
    list.push({ tag: r.u16(at), type: r.u16(at + 2), count: r.u32(at + 4), valueAt: at + 8 });
  }
  return list;
}

function decodeValue(tiff, entry) {
  const r = reader(tiff);
  const size = (TYPE_SIZES[entry.type] || 1) * entry.count;
  const at = size <= 4 ? entry.valueAt : r.u32(entry.valueAt);
  if (at + size > tiff.length) return undefined;
  switch (entry.type) {
    case 2:
      return tiff.toString('latin1', at, at + entry.count).replace(/\0+$/, '');
    case 3: {
      const values = Array.from({ length: entry.count }, (_, i) => r.u16(at + i * 2));
      return entry.count === 1 ? values[0] : values;
    }
    case 4: {
      const values = Array.from({ length: entry.count }, (_, i) => r.u32(at + i * 4));
      return entry.count === 1 ? values[0] : values;
    }
    case 5:
    case 10: {
      const read = entry.type === 5 ? r.u32 : r.i32;
      const values = Array.from({ length: entry.count }, (_, i) => {
        const denominator = read(at + i * 8 + 4);
        return denominator ? read(at + i * 8) / denominator : 0;
      });
      return entry.count === 1 ? values[0] : values;
    }
    default:
      return tiff.subarray(at, at + size);
  }
}

/**
 * Lê as tags de um bloco EXIF, agrupadas por diretório. Usado pelos testes e
 * para localizar a orientação — não pretende cobrir o EXIF inteiro.
 */
function parseExif(buf) {
  const tiff = toTiff(buf);
  if (!tiff) return null;
  const r = reader(tiff);
  const read = (offset) => {
    const map = {};
    for (const entry of entries(tiff, offset)) map[entry.tag] = decodeValue(tiff, entry);
    return map;
  };
  const ifd0 = read(r.u32(4));
  return {
    ifd0,
    exif: ifd0[TAG_EXIF_IFD] ? read(ifd0[TAG_EXIF_IFD]) : {},
    gps: ifd0[TAG_GPS_IFD] ? read(ifd0[TAG_GPS_IFD]) : {},
  };
}

/**
 * Devolve uma cópia com a orientação = 1. A rotação já foi aplicada aos pixels;
 * deixar a tag original faria o visualizador girar a imagem uma segunda vez.
 */
function withUprightOrientation(buf) {
  const source = toTiff(buf);
  if (!source) return null;
  const tiff = Buffer.from(source);
  const r = reader(tiff);
  for (const entry of entries(tiff, r.u32(4))) {
    if (entry.tag === TAG_ORIENTATION && entry.type === 3) r.w16(1, entry.valueAt);
  }
  return tiff;
}

// --- WebP (contêiner RIFF) ------------------------------------------------------

function riffChunks(webp) {
  if (webp.toString('latin1', 0, 4) !== 'RIFF' || webp.toString('latin1', 8, 12) !== 'WEBP') {
    throw new Error('não é um arquivo WebP');
  }
  const chunks = [];
  let at = 12;
  while (at + 8 <= webp.length) {
    const fourcc = webp.toString('latin1', at, at + 4);
    const size = webp.readUInt32LE(at + 4);
    chunks.push({ fourcc, data: webp.subarray(at + 8, at + 8 + size) });
    at += 8 + size + (size & 1);
  }
  return chunks;
}

/** Dimensões e alfa lidos do próprio bitstream, para montar o cabeçalho VP8X. */
function bitstreamInfo(chunk) {
  const d = chunk.data;
  if (chunk.fourcc === 'VP8 ') {
    return { width: d.readUInt16LE(6) & 0x3fff, height: d.readUInt16LE(8) & 0x3fff, alpha: false };
  }
  const bits = d.readUInt32LE(1); // VP8L: byte 0 é a assinatura 0x2f
  return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1, alpha: ((bits >>> 28) & 1) === 1 };
}

/**
 * Insere (ou substitui) o chunk EXIF de um WebP.
 *
 * Um WebP simples é só `VP8 ` ou `VP8L`; metadados exigem o formato estendido,
 * com um cabeçalho `VP8X` que sinaliza o EXIF. Pela especificação, o EXIF vem
 * depois dos dados da imagem e antes de um eventual XMP.
 */
function injectExif(webp, exifBlock) {
  const tiff = toTiff(exifBlock);
  if (!tiff) return webp;

  let chunks = riffChunks(webp).filter((chunk) => chunk.fourcc !== 'EXIF');
  const vp8x = chunks.find((chunk) => chunk.fourcc === 'VP8X');
  if (vp8x) {
    vp8x.data = Buffer.from(vp8x.data);
    vp8x.data[0] |= 0x08;
  } else {
    const image = chunks.find((chunk) => chunk.fourcc === 'VP8 ' || chunk.fourcc === 'VP8L');
    if (!image) return webp;
    const { width, height, alpha } = bitstreamInfo(image);
    const header = Buffer.alloc(10);
    header[0] = 0x08 | (alpha || chunks.some((chunk) => chunk.fourcc === 'ALPH') ? 0x10 : 0);
    header.writeUIntLE(width - 1, 4, 3);
    header.writeUIntLE(height - 1, 7, 3);
    chunks = [{ fourcc: 'VP8X', data: header }, ...chunks];
  }

  const exifChunk = { fourcc: 'EXIF', data: tiff };
  const xmpAt = chunks.findIndex((chunk) => chunk.fourcc === 'XMP ');
  if (xmpAt >= 0) chunks.splice(xmpAt, 0, exifChunk);
  else chunks.push(exifChunk);

  const parts = [];
  for (const { fourcc, data } of chunks) {
    const head = Buffer.alloc(8);
    head.write(fourcc, 0, 'latin1');
    head.writeUInt32LE(data.length, 4);
    parts.push(head, data);
    if (data.length & 1) parts.push(Buffer.alloc(1));
  }
  const body = Buffer.concat(parts);
  const riff = Buffer.alloc(12);
  riff.write('RIFF', 0, 'latin1');
  riff.writeUInt32LE(4 + body.length, 4);
  riff.write('WEBP', 8, 'latin1');
  return Buffer.concat([riff, body]);
}

/** O bloco EXIF de um WebP, ou null. */
function webpExifBlock(webp) {
  const chunk = riffChunks(webp).find((c) => c.fourcc === 'EXIF');
  return chunk ? toTiff(chunk.data) : null;
}

module.exports = {
  TAG_ORIENTATION,
  parseExif,
  withUprightOrientation,
  injectExif,
  webpExifBlock,
  riffChunks,
};
