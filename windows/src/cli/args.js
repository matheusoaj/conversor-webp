'use strict';

const os = require('os');
const { defaultSettings, presetById, placementById, watermarkStyle } = require('../core/settings');
const preferences = require('../core/preferences');

const TOOL = 'webpify';

class UsageError extends Error {
  /** @param {boolean} isHelp a mensagem é o texto de ajuda, que vai para a saída normal */
  constructor(message, isHelp = false) {
    super(message);
    this.isHelp = isHelp;
  }
}

/** Pedido de ajuda ou versão: não é erro, só encerra depois de imprimir. */
class EarlyExit extends Error {
  constructor(output) {
    super(output);
    this.output = output;
  }
}

function usage(version) {
  return `${TOOL} ${version} — converte JPEG, PNG e HEIC em WebP.

USO
  ${TOOL} [opções] <arquivo ou pasta> ...

Pastas são percorridas recursivamente. Cada imagem é gravada em
<pasta do original>\\webp\\<nome>.webp — ou em webp-amostra\\ quando
leva marca d'água.

OPÇÕES
  -q, --qualidade <0-100>   Qualidade da compressão (padrão: 82)
  -p, --preset <nome>       alta (90), media (82) ou leve (70)
  -m, --metodo <0-6>        Esforço do compressor (padrão: 4)
  -j, --jobs <n>            Conversões simultâneas (padrão: núcleos da CPU)
      --pasta <nome>        Nome da subpasta de saída (padrão: webp)
      --sobrescrever        Regrava arquivos .webp já existentes
      --sem-metadados       Não copia o EXIF do original
      --silencioso          Só imprime erros
      --notificar           Exibe uma notificação ao terminar
  -h, --ajuda               Mostra esta ajuda
  -v, --versao              Mostra a versão

MARCA D'ÁGUA
      --amostra             Usa a marca e os ajustes salvos no app
      --marca-dagua <arq>   Usa outra imagem como marca (PNG transparente)
      --posicao <nome>      centro, repetida ou canto
      --tamanho <5-100>     Percentual da imagem ocupado pela marca
      --opacidade <5-100>   Percentual de opacidade (padrão: 40)

EXEMPLOS
  ${TOOL} C:\\Fotos\\produto.jpg
  ${TOOL} --preset leve C:\\Fotos\\catalogo
  ${TOOL} --amostra C:\\Fotos\\catalogo
  ${TOOL} --marca-dagua C:\\logo.png --posicao repetida --opacidade 25 C:\\Fotos`;
}

/**
 * Lê os argumentos com as mesmas regras e mensagens da versão Mac.
 * @returns {{settings: object, inputs: string[], jobs: number, quiet: boolean, notify: boolean}}
 */
function parse(argv, version) {
  const options = {
    settings: defaultSettings(),
    inputs: [],
    jobs: os.availableParallelism(),
    quiet: false,
    notify: false,
  };
  const mark = { path: null, useSaved: false, placement: null, scale: null, opacity: null };

  let index = 0;
  const next = (flag) => {
    index += 1;
    if (index >= argv.length) throw new UsageError(`a opção ${flag} precisa de um valor.`);
    return argv[index];
  };
  const percent = (flag, label) => {
    const raw = next(flag);
    const value = Number(String(raw).replace('%', ''));
    if (!Number.isFinite(value) || value < 5 || value > 100) {
      throw new UsageError(`${label} inválido(a): ${raw}. Use um percentual entre 5 e 100.`);
    }
    return value;
  };

  for (; index < argv.length; index++) {
    const arg = argv[index];
    switch (arg) {
      case '-h': case '--ajuda': case '--help':
        throw new EarlyExit(usage(version));
      case '-v': case '--versao': case '--version':
        throw new EarlyExit(`${TOOL} ${version}`);
      case '-q': case '--qualidade': case '--quality': {
        const raw = next(arg);
        const value = Number(raw);
        if (raw === '' || !Number.isFinite(value) || value < 0 || value > 100) {
          throw new UsageError(`qualidade inválida: ${raw}. Use um número entre 0 e 100.`);
        }
        options.settings.quality = value;
        break;
      }
      case '-p': case '--preset': {
        const raw = next(arg);
        const preset = presetById(raw);
        if (!preset) throw new UsageError(`preset inválido: ${raw}. Use alta, media ou leve.`);
        options.settings.quality = preset.quality;
        break;
      }
      case '-m': case '--metodo': case '--method': {
        const raw = next(arg);
        const value = Number(raw);
        if (!Number.isInteger(value) || value < 0 || value > 6) {
          throw new UsageError(`método inválido: ${raw}. Use um número entre 0 e 6.`);
        }
        options.settings.method = value;
        break;
      }
      case '-j': case '--jobs': {
        const raw = next(arg);
        const value = Number(raw);
        if (!Number.isInteger(value) || value <= 0) throw new UsageError(`número de jobs inválido: ${raw}.`);
        options.jobs = value;
        break;
      }
      case '--pasta': case '--folder':
        options.settings.outputFolderName = next(arg);
        break;
      case '--sobrescrever': case '--overwrite':
        options.settings.overwrite = true;
        break;
      case '--sem-metadados': case '--no-metadata':
        options.settings.preserveMetadata = false;
        break;
      case '--silencioso': case '--quiet':
        options.quiet = true;
        break;
      case '--notificar': case '--notify':
        options.notify = true;
        break;
      case '--amostra': case '--sample':
        mark.useSaved = true;
        break;
      case '--marca-dagua': case '--watermark':
        mark.path = next(arg);
        break;
      case '--posicao': case '--position': {
        const raw = next(arg);
        const placement = placementById(raw);
        if (!placement) throw new UsageError(`posição inválida: ${raw}. Use centro, repetida ou canto.`);
        mark.placement = placement.id;
        break;
      }
      case '--tamanho': case '--size':
        mark.scale = percent(arg, 'tamanho');
        break;
      case '--opacidade': case '--opacity':
        mark.opacity = percent(arg, 'opacidade');
        break;
      default:
        if (arg.startsWith('-') && arg.length > 1) throw new UsageError(`opção desconhecida: ${arg}`);
        options.inputs.push(arg);
    }
  }

  if (options.inputs.length === 0) throw new UsageError(usage(version), true);

  const wantsMark = mark.useSaved || mark.path !== null;
  if ((mark.placement || mark.scale !== null || mark.opacity !== null) && !wantsMark) {
    throw new UsageError('--posicao, --tamanho e --opacidade só valem junto com --amostra ou --marca-dagua.');
  }
  if (wantsMark) options.settings.watermark = resolveWatermark(mark);
  return options;
}

/**
 * `--amostra` parte da marca e dos ajustes salvos no app; `--marca-dagua` troca o
 * arquivo. Ajustes passados na linha de comando vencem os salvos.
 */
function resolveWatermark(mark) {
  let style = watermarkStyle();
  if (mark.useSaved) {
    const saved = preferences.load();
    style = watermarkStyle({
      placement: saved.watermarkPlacement,
      scale: saved.watermarkScale,
      opacity: saved.watermarkOpacity,
    });
  }

  let imagePath = mark.path;
  if (!imagePath) {
    if (!preferences.hasStoredWatermark()) {
      throw new UsageError('nenhuma marca d\'água salva. Abra o Conversor WebP, marque "Marca d\'água de amostra" e escolha a imagem.');
    }
    imagePath = preferences.watermarkStorePath();
  }

  if (mark.placement) style = watermarkStyle({ placement: mark.placement, opacity: style.opacity });
  if (mark.scale !== null) style.scale = mark.scale / 100;
  if (mark.opacity !== null) style.opacity = mark.opacity / 100;
  return { imagePath, ...style };
}

module.exports = { parse, usage, UsageError, EarlyExit, TOOL };
