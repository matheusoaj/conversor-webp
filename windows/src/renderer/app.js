'use strict';

// Janela principal. Espelha o ConversionModel e as views SwiftUI do app Mac:
// as mesmas fases, os mesmos textos e as mesmas regras.

(() => {
  const api = window.conversor;
  const { ICONS, UI } = window;
  const $ = (id) => document.getElementById(id);

  const state = {
    phase: 'empty', // empty | scanning | ready | converting | finished
    files: [], // [{path, size}]
    progress: null,
    summary: null,
    preferences: null,
    watermark: null, // {thumbnail, width, height, hasTransparency}
    lastRun: null, // {firstFile, settings} — "Mostrar no Explorador" abre a pasta certa mesmo se a marca mudar depois
    runId: 0,
    showsFailures: false,
    icons: new Map(), // extensão → data URL do ícone do Windows
  };

  // ---------------------------------------------------------------- derivados

  const totalBytes = () => state.files.reduce((sum, file) => sum + file.size, 0);
  const activePreset = () => UI.QUALITY_PRESETS.find((p) => Math.abs(p.quality - state.preferences.quality) < 0.5);
  /** A marca só entra quando a caixa está marcada *e* há uma imagem guardada. */
  const watermarkActive = () => state.preferences.watermarkEnabled && Boolean(state.watermark);
  const outputFolder = () => UI.outputFolder(state.preferences, watermarkActive());

  function canConvert() {
    // Caixa marcada sem imagem: melhor travar do que converter sem a marca pedida.
    const watermarkReady = !state.preferences.watermarkEnabled || Boolean(state.watermark);
    return state.files.length > 0 && state.phase !== 'converting' && state.phase !== 'scanning' && watermarkReady;
  }

  function conversionSettings() {
    const p = state.preferences;
    return {
      quality: p.quality,
      method: p.method,
      preserveMetadata: p.preserveMetadata,
      outputFolderName: p.outputFolderName,
      overwrite: p.overwriteExisting,
      watermark: watermarkActive()
        ? { placement: p.watermarkPlacement, scale: p.watermarkScale, opacity: p.watermarkOpacity }
        : null,
    };
  }

  function savePreferences(changes) {
    Object.assign(state.preferences, changes);
    api.savePreferences(changes);
    renderOptions();
    renderActions();
  }

  // ---------------------------------------------------------------- ações

  async function add(paths) {
    if (!paths.length || state.phase === 'converting') return;
    state.phase = 'scanning';
    render();

    // A varredura roda fora da janela: uma pasta com milhares de itens não congela nada.
    const found = await api.expand(paths, state.preferences.outputFolderName);
    const seen = new Set(state.files.map((file) => file.path.toLowerCase()));
    for (const file of found) {
      if (!seen.has(file.path.toLowerCase())) {
        seen.add(file.path.toLowerCase());
        state.files.push(file);
      }
    }
    state.summary = null;
    state.progress = null;
    state.phase = state.files.length ? 'ready' : 'empty';
    render();
  }

  async function chooseFiles() {
    add(await api.chooseFiles());
  }

  async function chooseFolder() {
    add(await api.chooseFolder());
  }

  function remove(filePath) {
    state.files = state.files.filter((file) => file.path !== filePath);
    if (!state.files.length) state.phase = 'empty';
    render();
  }

  function clear() {
    if (state.phase === 'converting') cancel();
    state.files = [];
    state.progress = null;
    state.summary = null;
    state.phase = 'empty';
    render();
  }

  async function convert() {
    if (!canConvert()) return;
    const runId = ++state.runId;
    const settings = conversionSettings();
    state.lastRun = { firstFile: state.files[0].path, settings };
    state.phase = 'converting';
    state.summary = null;
    state.showsFailures = false;
    state.progress = { completed: 0, total: state.files.length, currentFile: null, originalBytes: 0, convertedBytes: 0 };
    render();

    const result = await api.convert(state.files.map((file) => file.path), settings);
    if (runId !== state.runId) return; // cancelado nesse meio-tempo
    if (result.error) {
      state.progress = null;
      state.phase = 'ready';
      render();
      showAlert('Não foi possível converter', result.error);
      return;
    }
    state.summary = result.summary;
    state.phase = 'finished';
    render();
  }

  function cancel() {
    api.cancel();
    state.runId += 1;
    state.progress = null;
    state.phase = state.files.length ? 'ready' : 'empty';
    render();
  }

  /** Volta à espera mantendo as opções, para converter outro lote. */
  function reset() {
    state.files = [];
    state.progress = null;
    state.summary = null;
    state.phase = 'empty';
    render();
  }

  function reveal() {
    if (state.lastRun) api.reveal(state.lastRun.firstFile, state.lastRun.settings);
  }

  /**
   * Na primeira vez não há imagem guardada: a caixa só fica marcada depois que uma
   * é escolhida, e a janela de ajuste abre em seguida para a prévia.
   */
  async function toggleWatermark(enabled) {
    if (enabled && !state.watermark) {
      $('watermark-enabled').checked = false;
      const info = await api.chooseWatermark();
      if (!info) return;
      state.watermark = info;
      savePreferences({ watermarkEnabled: true });
      openWatermarkDialog();
      return;
    }
    savePreferences({ watermarkEnabled: enabled });
  }

  async function chooseWatermark() {
    const info = await api.chooseWatermark();
    if (!info) return;
    state.watermark = info;
    renderOptions();
    renderActions();
    openWatermarkDialog();
  }

  function openWatermarkDialog() {
    api.openWatermarkDialog(state.files.map((file) => file.path));
  }

  // ---------------------------------------------------------------- área principal

  function render() {
    renderMain();
    renderOptions();
    renderActions();
  }

  function renderMain() {
    const main = $('main');
    if (main.dataset.view !== state.phase) {
      main.dataset.view = state.phase;
      main.innerHTML = '';
    }
    switch (state.phase) {
      case 'empty': return renderDropZone(main);
      case 'scanning': return renderScanning(main);
      case 'ready': return renderFileList(main);
      case 'converting': return renderProgress(main);
      case 'finished': return renderSummary(main);
    }
  }

  function renderDropZone(main) {
    main.innerHTML = `
      <div class="dropzone">
        <div class="badge">${ICONS.photos}</div>
        <div class="texts">
          <h1 class="title3">Arraste imagens ou pastas aqui</h1>
          <p class="callout secondary">JPEG · PNG · HEIC — pastas entram inteiras, incluindo subpastas</p>
        </div>
        <div class="choose">
          <button class="btn large" data-action="choose-files">Escolher Arquivos…</button>
          <button class="link callout" data-action="choose-folder">ou escolher uma pasta</button>
        </div>
        <p class="footnote tertiary">Cada imagem é gravada em ${UI.escape(outputFolder())}\\ ao lado do original.</p>
      </div>`;
  }

  function renderScanning(main) {
    if (main.firstElementChild) return;
    main.innerHTML = `
      <div class="scanning">
        <div class="spinner"></div>
        <p class="callout secondary">Procurando imagens…</p>
      </div>`;
  }

  function iconFor(filePath) {
    const extension = filePath.split('.').pop().toLowerCase();
    const icon = state.icons.get(extension);
    return icon ? `<img src="${icon}" alt="">` : ICONS.image;
  }

  /** Ícones reais do Windows, um por extensão — como o app Mac usa os do Finder. */
  async function loadIcons() {
    const pending = new Map();
    for (const file of state.files) {
      const extension = file.path.split('.').pop().toLowerCase();
      if (!state.icons.has(extension) && !pending.has(extension)) pending.set(extension, file.path);
    }
    if (!pending.size) return;
    await Promise.all([...pending].map(async ([extension, sample]) => {
      const icon = await api.fileIcon(sample);
      if (icon) state.icons.set(extension, icon);
    }));
    if (state.phase === 'ready') renderFileList($('main'), true);
  }

  function renderFileList(main, force = false) {
    const signature = `${state.files.length}:${state.icons.size}`;
    if (!force && main.dataset.signature === signature && main.firstElementChild) return;
    main.dataset.signature = signature;
    const rows = state.files.map((file) => `
      <div class="file-row">
        <span class="file-icon">${iconFor(file.path)}</span>
        <span class="names">
          <span class="name" title="${UI.escape(file.path)}">${UI.escape(UI.baseName(file.path))}</span>
          <span class="path"><bdi>${UI.escape(UI.directoryName(file.path))}</bdi></span>
        </span>
        <button class="icon-btn remove" data-action="remove" data-path="${UI.escape(file.path)}" title="Remover da lista">${ICONS.xCircleFill}</button>
      </div>`).join('');
    const scroll = main.querySelector('.rows')?.scrollTop ?? 0;
    main.innerHTML = `
      <div class="file-list">
        <header>
          <span class="headline">${UI.imageCount(state.files.length)}</span>
          <span class="tertiary">·</span>
          <span class="callout secondary">${UI.bytes(totalBytes())}</span>
          <span class="spacer"></span>
          <button class="link" data-action="choose-files">Adicionar…</button>
          <button class="link" data-action="clear">Limpar</button>
        </header>
        <div class="rows">${rows}</div>
      </div>`;
    main.querySelector('.rows').scrollTop = scroll;
    loadIcons();
  }

  function renderProgress(main) {
    const p = state.progress;
    if (!main.firstElementChild) {
      main.innerHTML = `
        <div class="progress-panel">
          <div class="count"></div>
          <p class="current callout secondary"></p>
          <div class="bar"><div></div></div>
          <p class="so-far footnote tertiary mono"></p>
        </div>`;
    }
    main.querySelector('.count').textContent = `${p.completed.toLocaleString('pt-BR')} de ${p.total.toLocaleString('pt-BR')}`;
    main.querySelector('.current').textContent = p.currentFile || 'Preparando…';
    main.querySelector('.bar > div').style.width = `${p.total ? (p.completed / p.total) * 100 : 0}%`;
    main.querySelector('.so-far').textContent = p.convertedBytes > 0
      ? `${UI.bytes(p.originalBytes)} → ${UI.bytes(p.convertedBytes)} até agora`
      : '';
  }

  function renderSummary(main) {
    const s = state.summary;
    const failed = s.failures.length > 0;
    const saved = Math.max(0, s.originalBytes - s.convertedBytes);
    const fraction = s.originalBytes > 0 ? saved / s.originalBytes : 0;
    const title = s.converted > 0
      ? `${UI.imageCount(s.converted)} convertida${s.converted === 1 ? '' : 's'}`
      : 'Nada foi convertido';

    const savings = s.converted > 0 ? `
      <div class="savings">
        <div class="measures">
          <div class="measure"><span class="caption tertiary">Antes</span><span class="amount secondary">${UI.bytes(s.originalBytes)}</span></div>
          <span class="arrow">${ICONS.arrowRight}</span>
          <div class="measure"><span class="caption tertiary">Depois</span><span class="amount">${UI.bytes(s.convertedBytes)}</span></div>
        </div>
        <hr>
        <div class="saved">
          <span class="big">−${UI.percent(fraction)}</span>
          <span class="footnote secondary">${UI.bytes(saved)} economizados</span>
        </div>
      </div>` : '';

    const skipped = s.skipped > 0 ? `
      <p class="note footnote secondary">${ICONS.turnDownRight}
        <span>${s.skipped} já tinham .webp e foram puladas. Ligue "Regravar" nas opções avançadas para refazê-las.</span></p>` : '';

    const failures = failed ? `
      <div class="failures">
        <button class="disclosure-toggle secondary" data-action="toggle-failures" aria-expanded="${state.showsFailures}">
          ${ICONS.chevronRight}<span class="row">${s.failures.length} não puderam ser convertidas</span>
        </button>
        <div class="items" ${state.showsFailures ? '' : 'hidden'}>
          ${s.failures.map((f) => `<div><div class="callout">${UI.escape(UI.baseName(f.input))}</div><div class="caption secondary">${UI.escape(f.message)}</div></div>`).join('')}
        </div>
      </div>` : '';

    main.innerHTML = `
      <div class="summary"><div class="content">
        <div class="hero">
          <span class="${failed ? 'warn' : 'ok'}">${failed ? ICONS.warningFill : ICONS.checkCircleFill}</span>
          <h1 class="title2">${title}</h1>
        </div>
        ${savings}${skipped}${failures}
      </div></div>`;
  }

  // ---------------------------------------------------------------- opções

  function renderOptions() {
    const p = state.preferences;
    const preset = activePreset();
    const disabled = state.phase === 'converting';
    $('options').inert = disabled;
    $('options').style.opacity = disabled ? '0.55' : '';

    $('quality-value').textContent = Math.round(p.quality);
    $('quality').value = p.quality;
    $('preset-subtitle').textContent = preset ? preset.subtitle : 'Qualidade personalizada.';
    $('presets').innerHTML = UI.QUALITY_PRESETS.map((item) => `
      <button class="preset ${preset && preset.id === item.id ? 'selected' : ''}" data-quality="${item.quality}" title="${UI.escape(item.subtitle)}">
        <span class="title">${item.title}</span><span class="value">${item.quality}</span>
      </button>`).join('');

    renderWatermarkRow();

    const folder = $('folder');
    if (document.activeElement !== folder) folder.value = p.outputFolderName;
    $('method').value = p.method;
    $('method-value').textContent = p.method;
    $('metadata').checked = p.preserveMetadata;
    $('overwrite').checked = p.overwriteExisting;
  }

  function renderWatermarkRow() {
    const p = state.preferences;
    const enabled = p.watermarkEnabled;
    const hasImage = Boolean(state.watermark);
    $('watermark-enabled').checked = enabled;

    const caption = $('watermark-caption');
    caption.classList.toggle('warning', enabled && !hasImage);
    if (!enabled) caption.textContent = 'Aplica sua marca em cada imagem do lote';
    else if (!hasImage) caption.textContent = 'Escolha a imagem da marca para continuar';
    else {
      const placement = UI.PLACEMENTS.find((item) => item.id === p.watermarkPlacement) || UI.PLACEMENTS[0];
      caption.textContent = `${placement.title} · ${UI.percent(p.watermarkScale)} · opacidade ${UI.percent(p.watermarkOpacity)}`;
    }

    $('watermark-thumb').hidden = !(enabled && hasImage);
    $('watermark-adjust').hidden = !(enabled && hasImage);
    $('watermark-choose').hidden = !(enabled && !hasImage);
    if (hasImage) $('watermark-thumb').querySelector('img').src = state.watermark.thumbnail;
  }

  // ---------------------------------------------------------------- barra de ações

  function renderActions() {
    const status = {
      empty: 'Nenhuma imagem selecionada',
      scanning: 'Procurando imagens…',
      ready: `${UI.imageCount(state.files.length)} · qualidade ${Math.round(state.preferences.quality)}${watermarkActive() ? ' · com marca d\'água' : ''} → ${outputFolder()}\\`,
      converting: 'Convertendo…',
      finished: 'Concluído',
    }[state.phase];
    $('status').textContent = status;

    let buttons;
    if (state.phase === 'converting') {
      buttons = '<button class="btn large" data-action="cancel">Cancelar</button>';
    } else if (state.phase === 'finished') {
      buttons = `<button class="btn large" data-action="reveal">Mostrar no Explorador</button>
                 <button class="btn large primary" data-action="reset">Converter Mais</button>`;
    } else {
      buttons = `<button class="btn large primary" data-action="convert" ${canConvert() ? '' : 'disabled'}>Converter</button>`;
    }
    $('buttons').innerHTML = buttons;
  }

  // ---------------------------------------------------------------- alerta

  function showAlert(title, message) {
    $('alert-title').textContent = title;
    $('alert-message').textContent = message;
    $('alert').hidden = false;
    $('alert-ok').focus();
  }

  // ---------------------------------------------------------------- eventos

  const actions = {
    'choose-files': chooseFiles,
    'choose-folder': chooseFolder,
    clear,
    convert,
    cancel,
    reset,
    reveal,
    remove: (button) => remove(button.dataset.path),
    'toggle-failures': () => {
      state.showsFailures = !state.showsFailures;
      renderSummary($('main'));
    },
  };

  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-action]');
    if (button && actions[button.dataset.action]) actions[button.dataset.action](button);
    const preset = event.target.closest('.preset');
    if (preset) savePreferences({ quality: Number(preset.dataset.quality) });
  });

  $('quality').addEventListener('input', (event) => savePreferences({ quality: Number(event.target.value) }));
  $('method').addEventListener('input', (event) => savePreferences({ method: Number(event.target.value) }));
  $('metadata').addEventListener('change', (event) => savePreferences({ preserveMetadata: event.target.checked }));
  $('overwrite').addEventListener('change', (event) => savePreferences({ overwriteExisting: event.target.checked }));
  $('folder').addEventListener('input', (event) => savePreferences({ outputFolderName: event.target.value }));
  $('folder').addEventListener('blur', () => renderOptions());
  $('watermark-enabled').addEventListener('change', (event) => toggleWatermark(event.target.checked));
  $('watermark-adjust').addEventListener('click', openWatermarkDialog);
  $('watermark-choose').addEventListener('click', chooseWatermark);
  $('alert-ok').addEventListener('click', () => { $('alert').hidden = true; });

  $('advanced-toggle').innerHTML = `${ICONS.chevronRight}<span>Opções avançadas</span>`;
  $('advanced-toggle').addEventListener('click', () => {
    const toggle = $('advanced-toggle');
    const open = toggle.getAttribute('aria-expanded') !== 'true';
    toggle.setAttribute('aria-expanded', String(open));
    $('advanced').hidden = !open;
  });

  // O arraste vale para a janela inteira: mirar a área certa com 300 arquivos na
  // mão é um atrito desnecessário.
  let dragDepth = 0;
  const carriesFiles = (event) => [...(event.dataTransfer?.types || [])].includes('Files');
  window.addEventListener('dragenter', (event) => {
    if (!carriesFiles(event)) return;
    event.preventDefault();
    dragDepth += 1;
    $('drop-highlight').hidden = state.phase === 'converting';
  });
  window.addEventListener('dragover', (event) => {
    if (!carriesFiles(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = state.phase === 'converting' ? 'none' : 'copy';
  });
  window.addEventListener('dragleave', () => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth) $('drop-highlight').hidden = true;
  });
  window.addEventListener('drop', (event) => {
    event.preventDefault();
    dragDepth = 0;
    $('drop-highlight').hidden = true;
    const paths = [...event.dataTransfer.files].map((file) => api.pathForFile(file)).filter(Boolean);
    add(paths);
  });

  document.addEventListener('keydown', (event) => {
    const typing = event.target.matches('input[type="text"]');
    if (!$('alert').hidden) {
      if (event.key === 'Enter' || event.key === 'Escape') $('alert').hidden = true;
      return;
    }
    if (event.ctrlKey && event.key.toLowerCase() === 'o') {
      event.preventDefault();
      chooseFiles();
    } else if (event.ctrlKey && event.key === 'Enter') {
      convert();
    } else if (event.ctrlKey && (event.key === 'Backspace' || event.key === 'Delete') && !typing) {
      clear();
    } else if (event.key === 'Escape' && state.phase === 'converting') {
      cancel();
    } else if (event.key === 'Enter' && !typing && !event.target.closest('button')) {
      if (state.phase === 'finished') reset();
      else convert();
    }
  });

  api.on('progress', (progress) => {
    if (state.phase !== 'converting') return;
    state.progress = progress;
    renderProgress($('main'));
  });
  api.on('add-files', (paths) => add(paths));
  api.on('accent-color', (color) => UI.applyAccent(color));
  api.on('preferences-changed', (preferences) => {
    state.preferences = preferences;
    renderOptions();
    renderActions();
    if (state.phase === 'empty') renderDropZone($('main'));
  });
  api.on('watermark-changed', (info) => {
    state.watermark = info;
    renderOptions();
    renderActions();
  });

  // ---------------------------------------------------------------- início

  api.init().then((data) => {
    state.preferences = data.preferences;
    state.watermark = data.watermark;
    UI.applyAccent(data.accentColor);
    render();
    if (data.launchPaths.length) add(data.launchPaths);
    document.body.dataset.ready = 'true';
  });
})();
