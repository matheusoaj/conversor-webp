'use strict';

const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const sharp = require('sharp');

const settingsLib = require('../src/core/settings');
const { expand } = require('../src/core/discovery');
const { planOutputs } = require('../src/core/planner');
const { convert, ConversionError } = require('../src/core/convert');
const { runBatch } = require('../src/core/batch');
const { Watermark, WatermarkError } = require('../src/core/watermark');
const exif = require('../src/core/exif');

const FIXTURES = path.join(__dirname, 'fixtures');
const expectedP3 = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'foto-p3.esperado.json'), 'utf8'));

/** Cópia das imagens de teste numa pasta temporária — os originais nunca são tocados. */
function workspace(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'conversor-webp-'));
  for (const name of files) fs.copyFileSync(path.join(FIXTURES, name), path.join(dir, name));
  return dir;
}

async function pixel(file, x, y) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const i = (y * info.width + x) * 4;
  return { r: data[i], g: data[i + 1], b: data[i + 2], a: data[i + 3] };
}

const settings = (overrides) => settingsLib.defaultSettings(overrides);
const exifOf = async (file) => exif.parseExif((await sharp(file).metadata()).exif);

before(() => {
  // Isola preferências e marca guardada dos testes da pasta real do usuário.
  process.env.CONVERSOR_WEBP_DADOS = fs.mkdtempSync(path.join(os.tmpdir(), 'conversor-webp-dados-'));
});

describe('configurações', () => {
  test('presets têm os mesmos valores do app Mac', () => {
    assert.deepEqual(settingsLib.QUALITY_PRESETS.map((p) => p.quality), [90, 82, 70]);
    assert.equal(settingsLib.presetMatching(82).id, 'media');
    assert.equal(settingsLib.presetMatching(75), null);
    assert.equal(settingsLib.presetById('média').id, 'media');
  });

  test('pasta de saída muda para -amostra quando há marca', () => {
    const plain = settings();
    const marked = settings({ watermark: { imagePath: 'x.png', placement: 'centro', scale: 0.6, opacity: 0.4 } });
    assert.equal(settingsLib.resolvedOutputFolderName(plain), 'webp');
    assert.equal(settingsLib.resolvedOutputFolderName(marked), 'webp-amostra');
    assert.equal(settingsLib.resolvedOutputFolderName(settings({ outputFolderName: '  ' })), 'webp');
    assert.equal(settingsLib.outputPath(path.join('pasta', 'foto.jpg'), plain), path.join('pasta', 'webp', 'foto.webp'));
  });
});

describe('varredura de arquivos', () => {
  test('pega só imagens, em ordem natural, e pula pastas já convertidas', async () => {
    const dir = workspace(['foto-exif.jpg', 'logo-transparente.png', 'foto.heic', 'leiame.txt']);
    for (const folder of ['webp', 'webp-amostra']) {
      fs.mkdirSync(path.join(dir, folder));
      fs.copyFileSync(path.join(FIXTURES, 'foto-exif.jpg'), path.join(dir, folder, 'ja-convertida.jpg'));
    }
    fs.mkdirSync(path.join(dir, 'sub'));
    fs.copyFileSync(path.join(FIXTURES, 'foto-exif.jpg'), path.join(dir, 'sub', 'foto 10.jpg'));
    fs.copyFileSync(path.join(FIXTURES, 'foto-exif.jpg'), path.join(dir, 'sub', 'foto 9.jpg'));

    const found = (await expand([dir])).map((f) => path.relative(dir, f));
    assert.deepEqual(found, [
      'foto-exif.jpg',
      'foto.heic',
      'logo-transparente.png',
      path.join('sub', 'foto 9.jpg'),
      path.join('sub', 'foto 10.jpg'),
    ]);
  });

  test('o mesmo arquivo com maiúsculas diferentes entra uma vez só', async () => {
    const dir = workspace(['foto-exif.jpg']);
    const file = path.join(dir, 'foto-exif.jpg');
    const found = await expand([file, file.toUpperCase().replace(dir.toUpperCase(), dir), dir]);
    assert.equal(found.length, 1);
  });
});

describe('nomes de saída', () => {
  test('mesmo nome com extensões diferentes ganha o sufixo da extensão', () => {
    const plans = planOutputs(['a/produto.jpg', 'a/produto.png', 'a/produto.heic', 'a/unico.jpg'], settings());
    assert.deepEqual(plans.map((p) => path.basename(p.output)), [
      'produto-jpg.webp', 'produto-png.webp', 'produto-heic.webp', 'unico.webp',
    ]);
  });

  test('maiúsculas diferentes contam como o mesmo destino, como no Windows', () => {
    const plans = planOutputs(['a/Foto.jpg', 'a/foto.PNG'], settings());
    assert.deepEqual(plans.map((p) => path.basename(p.output)), ['Foto-jpg.webp', 'foto-png.webp']);
  });

  test('um arquivo que já se chama foto-jpg não perde o nome para um desempate', () => {
    const plans = planOutputs(['a/foto.jpg', 'a/foto.png', 'a/foto-jpg.png'], settings());
    const names = plans.map((p) => path.basename(p.output));
    assert.equal(names[2], 'foto-jpg.webp');
    assert.equal(new Set(names.map((n) => n.toLowerCase())).size, 3, `nomes repetidos: ${names}`);
  });
});

describe('conversão', () => {
  test('JPEG preserva dimensões e EXIF completo, sem tag de rotação', async () => {
    const dir = workspace(['foto-exif.jpg']);
    const result = await convert(path.join(dir, 'foto-exif.jpg'), settings());
    const meta = await sharp(result.output).metadata();
    assert.equal(meta.format, 'webp');
    assert.equal(`${meta.width}×${meta.height}`, '400×250');
    assert.equal(meta.hasAlpha, false);
    const tags = await exifOf(result.output);
    assert.equal(tags.exif[0x9003], '2024:03:15 14:22:31');
    assert.equal(tags.ifd0[0x0110], 'Camera Teste X1');
    assert.equal(tags.exif[0xa434], 'Teste 24-70mm f/2.8');
    assert.equal(tags.gps[1], 'S');
    assert.ok(Math.abs(tags.gps[2][0] + tags.gps[2][1] / 60 + tags.gps[2][2] / 3600 - 23.5505) < 0.001);
    assert.ok(!tags.ifd0[0x0112] || tags.ifd0[0x0112] === 1);
  });

  for (const name of ['foto-girada.jpg', 'foto-girada.heic']) {
    test(`${name}: a rotação é aplicada nos pixels`, async () => {
      const dir = workspace([name]);
      const result = await convert(path.join(dir, name), settings());
      const meta = await sharp(result.output).metadata();
      assert.equal(`${meta.width}×${meta.height}`, '250×400');
      // A faixa vermelha do topo original vai para a direita com a orientação 6.
      const right = await pixel(result.output, 245, 200);
      const left = await pixel(result.output, 5, 200);
      assert.ok(right.r > 200 && right.g < 60 && right.b < 60, `direita: ${JSON.stringify(right)}`);
      assert.ok(!(left.r > 200 && left.g < 60), `esquerda não deveria ser vermelha: ${JSON.stringify(left)}`);
    });
  }

  test('HEIC preserva EXIF — extraído do contêiner à parte', async () => {
    const dir = workspace(['foto.heic']);
    const result = await convert(path.join(dir, 'foto.heic'), settings());
    const tags = await exifOf(result.output);
    assert.equal(tags.exif[0x9003], '2024:03:15 14:22:31');
    assert.equal(tags.ifd0[0x0110], 'Camera Teste X1');
    assert.equal(tags.gps[3], 'W');
  });

  for (const name of ['foto-p3.jpg', 'foto-p3.heic']) {
    test(`${name}: cores em Display P3 são convertidas para sRGB`, async () => {
      const dir = workspace([name]);
      const result = await convert(path.join(dir, name), settings({ quality: 100 }));
      const p = await pixel(result.output, 60, 40);
      const diff = Math.max(Math.abs(p.r - expectedP3.r), Math.abs(p.g - expectedP3.g), Math.abs(p.b - expectedP3.b));
      assert.ok(diff <= 5, `obtido (${p.r}, ${p.g}, ${p.b}), esperado (${expectedP3.r}, ${expectedP3.g}, ${expectedP3.b})`);
    });
  }

  test('PNG transparente continua transparente', async () => {
    const dir = workspace(['logo-transparente.png']);
    const result = await convert(path.join(dir, 'logo-transparente.png'), settings());
    assert.equal((await sharp(result.output).metadata()).hasAlpha, true);
    assert.ok((await pixel(result.output, 20, 180)).a < 16, 'quadrante transparente');
    assert.ok((await pixel(result.output, 180, 20)).a > 240, 'região opaca');
  });

  test('PNG opaco com canal alfa sai sem canal alfa', async () => {
    const dir = workspace(['captura-opaca.png']);
    const result = await convert(path.join(dir, 'captura-opaca.png'), settings());
    assert.equal((await sharp(result.output).metadata()).hasAlpha, false);
  });

  test('arquivo corrompido falha com mensagem clara', async () => {
    const dir = workspace(['quebrado.jpg']);
    await assert.rejects(convert(path.join(dir, 'quebrado.jpg'), settings()), (error) => {
      assert.ok(error instanceof ConversionError);
      assert.match(error.message, /Não foi possível ler quebrado\.jpg/);
      return true;
    });
  });

  test('sem metadados quando a opção está desligada', async () => {
    const dir = workspace(['foto-exif.jpg', 'foto.heic']);
    for (const name of ['foto-exif.jpg', 'foto.heic']) {
      const result = await convert(path.join(dir, name), settings({ preserveMetadata: false }));
      assert.equal((await sharp(result.output).metadata()).exif, undefined, name);
    }
  });

  test('pula o que já existe, e regrava quando pedido', async () => {
    const dir = workspace(['foto-exif.jpg']);
    const input = path.join(dir, 'foto-exif.jpg');
    assert.equal((await convert(input, settings())).skipped, false);
    assert.equal((await convert(input, settings())).skipped, true);
    assert.equal((await convert(input, settings({ overwrite: true }))).skipped, false);
  });

  test('data de modificação acompanha o original', async () => {
    const dir = workspace(['foto-exif.jpg']);
    const input = path.join(dir, 'foto-exif.jpg');
    const past = new Date('2021-06-01T12:00:00Z');
    fs.utimesSync(input, past, past);
    const result = await convert(input, settings());
    assert.equal(fs.statSync(result.output).mtime.getTime(), past.getTime());
  });

  test('qualidade alta gera arquivo maior que a leve', async () => {
    const dir = workspace(['foto-exif.jpg']);
    const input = path.join(dir, 'foto-exif.jpg');
    const alta = await convert(input, settings({ quality: 90, outputFolderName: 'alta' }));
    const leve = await convert(input, settings({ quality: 70, outputFolderName: 'leve' }));
    assert.ok(alta.convertedBytes > leve.convertedBytes, `${alta.convertedBytes} vs ${leve.convertedBytes}`);
  });
});

describe('marca d\'água', () => {
  /** Quadrado branco opaco: deixa a posição da marca inequívoca nos pixels. */
  async function whiteSquare(dir) {
    const file = path.join(dir, 'quadrado.png');
    await sharp({ create: { width: 100, height: 100, channels: 4, background: '#ffffff' } }).png().toFile(file);
    return file;
  }

  /** Tela cinza 400×300 para receber a marca. */
  async function grayCanvas(dir) {
    const file = path.join(dir, 'tela.png');
    await sharp({ create: { width: 400, height: 300, channels: 3, background: '#404040' } }).png().toFile(file);
    return file;
  }

  const withMark = (imagePath, style) => settings({ quality: 100, watermark: { imagePath, ...settingsLib.watermarkStyle(style) } });

  test('centro: marca no meio, bordas intactas, na pasta webp-amostra', async () => {
    const dir = workspace([]);
    const result = await convert(await grayCanvas(dir), withMark(await whiteSquare(dir), { placement: 'centro', opacity: 1 }));
    assert.equal(path.basename(path.dirname(result.output)), 'webp-amostra');
    assert.ok((await pixel(result.output, 200, 150)).r > 240, 'centro branco');
    assert.ok((await pixel(result.output, 5, 5)).r < 80, 'canto intacto');
  });

  test('opacidade mistura a marca com a imagem', async () => {
    const dir = workspace([]);
    const result = await convert(await grayCanvas(dir), withMark(await whiteSquare(dir), { placement: 'centro', opacity: 0.5 }));
    const center = (await pixel(result.output, 200, 150)).r;
    assert.ok(center > 130 && center < 175, `esperado ~(64+255)/2, obtido ${center}`);
  });

  test('canto: marca embaixo à direita', async () => {
    const dir = workspace([]);
    const result = await convert(await grayCanvas(dir), withMark(await whiteSquare(dir), { placement: 'canto', opacity: 1 }));
    assert.ok((await pixel(result.output, 370, 270)).r > 240, 'canto inferior direito branco');
    assert.ok((await pixel(result.output, 200, 150)).r < 80, 'centro intacto');
    assert.ok((await pixel(result.output, 30, 30)).r < 80, 'canto superior esquerdo intacto');
  });

  test('repetida: grade simétrica cobrindo a imagem', async () => {
    const dir = workspace([]);
    const result = await convert(await grayCanvas(dir), withMark(await whiteSquare(dir), { placement: 'repetida', opacity: 1 }));
    const { data, info } = await sharp(result.output).raw().toBuffer({ resolveWithObject: true });
    let white = 0;
    let asymmetric = 0;
    for (let y = 0; y < info.height; y += 3) {
      for (let x = 0; x < info.width; x += 3) {
        const at = (y * info.width + x) * info.channels;
        const mirror = (y * info.width + (info.width - 1 - x)) * info.channels;
        if (data[at] > 200) white++;
        if (Math.abs(data[at] - data[mirror]) > 60) asymmetric++;
      }
    }
    const samples = Math.ceil(info.height / 3) * Math.ceil(info.width / 3);
    assert.ok(white / samples > 0.15 && white / samples < 0.6, `cobertura ${(white / samples).toFixed(2)}`);
    assert.ok(asymmetric / samples < 0.02, `assimetria ${(asymmetric / samples).toFixed(3)}`);
  });

  test('a marca vai para o canto da foto já endireitada', async () => {
    const dir = workspace(['foto-girada.jpg']);
    const result = await convert(path.join(dir, 'foto-girada.jpg'), withMark(await whiteSquare(dir), { placement: 'canto', opacity: 1 }));
    const meta = await sharp(result.output).metadata();
    assert.equal(`${meta.width}×${meta.height}`, '250×400');
    // Marca de 55×55 a 8 px das bordas: ocupa x 187–242, y 337–392. O ponto fica
    // fora da faixa vermelha (x ≥ 225), para só o branco da marca passar no teste.
    const p = await pixel(result.output, 200, 365);
    assert.ok(p.r > 240 && p.g > 240 && p.b > 240, `esperado branco, obtido ${JSON.stringify(p)}`);
  });

  test('tamanho respeita a proporção da marca e a caixa da imagem', async () => {
    const mark = new Watermark(Buffer.alloc(0), 300, 100, { placement: 'centro', scale: 0.5 });
    assert.deepEqual(mark.markSize(400, 1000), { width: 200, height: 67 }); // limitado pela largura
    assert.deepEqual(mark.markSize(1000, 100), { width: 150, height: 50 }); // limitado pela altura
  });

  test('detecta marca sem transparência', async () => {
    assert.equal(await (await Watermark.load(path.join(FIXTURES, 'marca-teste.png'))).hasTransparency(), true);
    assert.equal(await (await Watermark.load(path.join(FIXTURES, 'marca-opaca.jpg'))).hasTransparency(), false);
  });

  test('marca ilegível interrompe o lote antes de gravar qualquer coisa', async () => {
    const dir = workspace(['foto-exif.jpg']);
    const marked = withMark(path.join(dir, 'nao-existe.png'), {});
    await assert.rejects(runBatch([path.join(dir, 'foto-exif.jpg')], marked), WatermarkError);
    assert.equal(fs.existsSync(path.join(dir, 'webp-amostra')), false);
  });
});

describe('lote', () => {
  test('converte, conta falhas e informa o progresso', async () => {
    const names = ['foto-exif.jpg', 'foto.heic', 'logo-transparente.png', 'quebrado.jpg'];
    const dir = workspace(names);
    const progress = [];
    const summary = await runBatch(names.map((n) => path.join(dir, n)), settings(), {
      onProgress: (p) => progress.push(p.completed),
    });
    assert.equal(summary.converted, 3);
    assert.equal(summary.failures.length, 1);
    assert.match(summary.failures[0].message, /quebrado\.jpg/);
    assert.ok(summary.convertedBytes < summary.originalBytes);
    assert.deepEqual(progress, [1, 2, 3, 4]);
  });

  test('desempata nomes iguais dentro do lote', async () => {
    const dir = workspace([]);
    fs.copyFileSync(path.join(FIXTURES, 'foto-exif.jpg'), path.join(dir, 'produto.jpg'));
    fs.copyFileSync(path.join(FIXTURES, 'logo-transparente.png'), path.join(dir, 'produto.png'));
    await runBatch(await expand([dir]), settings());
    assert.deepEqual(fs.readdirSync(path.join(dir, 'webp')).sort(), ['produto-jpg.webp', 'produto-png.webp']);
  });

  test('cancelar para de pegar novos arquivos', async () => {
    const dir = workspace([]);
    const inputs = [];
    for (let i = 0; i < 12; i++) {
      const file = path.join(dir, `foto-${i}.jpg`);
      fs.copyFileSync(path.join(FIXTURES, 'foto-exif.jpg'), file);
      inputs.push(file);
    }
    const controller = new AbortController();
    const summary = await runBatch(inputs, settings(), {
      concurrency: 1,
      signal: controller.signal,
      onProgress: (p) => { if (p.completed === 2) controller.abort(); },
    });
    assert.equal(summary.cancelled, true);
    assert.equal(summary.converted, 2);
  });
});

describe('EXIF no contêiner WebP', () => {
  const tiff = () => exif.withUprightOrientation(require('../src/core/heic').exifBlock(fs.readFileSync(path.join(FIXTURES, 'foto.heic'))));

  for (const [label, options] of [
    ['com perdas (VP8)', { quality: 80 }],
    ['sem perdas (VP8L)', { lossless: true }],
  ]) {
    test(`injeção em WebP ${label} gera arquivo válido`, async () => {
      const webp = await sharp(path.join(FIXTURES, 'foto-exif.jpg')).webp(options).toBuffer();
      const injected = exif.injectExif(webp, tiff());
      assert.equal(injected.readUInt32LE(4), injected.length - 8, 'tamanho RIFF');
      assert.equal(exif.riffChunks(injected)[0].fourcc, 'VP8X');
      const meta = await sharp(injected).metadata();
      assert.equal(`${meta.width}×${meta.height}`, '400×250');
      assert.equal(exif.parseExif(meta.exif).exif[0x9003], '2024:03:15 14:22:31');
    });
  }

  test('injeção em WebP com transparência mantém o alfa', async () => {
    const webp = await sharp(path.join(FIXTURES, 'logo-transparente.png')).webp({ quality: 80 }).toBuffer();
    const meta = await sharp(exif.injectExif(webp, tiff())).metadata();
    assert.equal(meta.hasAlpha, true);
    assert.ok(meta.exif);
  });
});
