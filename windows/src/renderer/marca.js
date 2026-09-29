'use strict';

// Ajustes da marca d'água com prévia ao vivo sobre as imagens selecionadas.

(() => {
  const api = window.conversor;
  const { ICONS, UI } = window;
  const $ = (id) => document.getElementById(id);

  const state = {
    preferences: null,
    watermark: null,
    samples: [],
    sampleIndex: 0,
    previewToken: 0,
    previewTimer: null,
  };

  const style = () => ({
    placement: state.preferences.watermarkPlacement,
    scale: state.preferences.watermarkScale,
    opacity: state.preferences.watermarkOpacity,
  });

  function save(changes) {
    Object.assign(state.preferences, changes);
    api.savePreferences(changes);
    renderControls();
    schedulePreview();
  }

  /**
   * Trocar de posição volta o tamanho ao sugerido para ela: o tamanho bom para uma
   * marca única no centro vira uma parede quando repetido.
   */
  function setPlacement(id) {
    if (id === state.preferences.watermarkPlacement) return;
    const placement = UI.PLACEMENTS.find((item) => item.id === id);
    save({ watermarkPlacement: id, watermarkScale: placement.defaultScale });
  }

  /**
   * Arrastar um slider dispara dezenas de mudanças por segundo; esperar um instante
   * faz só a última virar prévia, e respostas atrasadas de pedidos antigos são descartadas.
   */
  function schedulePreview() {
    clearTimeout(state.previewTimer);
    state.previewTimer = setTimeout(async () => {
      const token = ++state.previewToken;
      const sample = state.samples[state.sampleIndex] || null;
      const url = await api.renderPreview(sample, style());
      if (token !== state.previewToken || !url) return;
      const preview = $('preview');
      preview.src = url;
      preview.hidden = false;
      $('preview-spinner').hidden = true;
    }, 40);
  }

  function renderNavigator() {
    const count = state.samples.length;
    const name = count ? UI.escape(UI.baseName(state.samples[state.sampleIndex])) : '';
    if (count > 1) {
      $('navigator').innerHTML = `
        <button class="icon-btn" data-step="-1" ${state.sampleIndex === 0 ? 'disabled' : ''} aria-label="Imagem anterior">${ICONS.chevronLeft}</button>
        <span class="label caption secondary">${state.sampleIndex + 1} de ${count.toLocaleString('pt-BR')} · ${name}</span>
        <button class="icon-btn" data-step="1" ${state.sampleIndex >= count - 1 ? 'disabled' : ''} aria-label="Próxima imagem">${ICONS.chevronRight}</button>`;
    } else if (count === 1) {
      $('navigator').innerHTML = `<span class="label caption secondary">${name}</span>`;
    } else {
      $('navigator').innerHTML = '<span class="caption secondary" style="text-align:center">Prévia sobre uma página de exemplo. Adicione imagens para ver a marca sobre elas.</span>';
    }
  }

  function renderImageInfo() {
    const mark = state.watermark;
    if (!mark) return;
    $('mark-thumb').src = mark.thumbnail;
    $('mark-size').textContent = `${mark.width} × ${mark.height} px`;
    const transparency = $('mark-transparency');
    transparency.classList.toggle('warning', !mark.hasTransparency);
    transparency.classList.toggle('secondary', mark.hasTransparency);
    transparency.innerHTML = mark.hasTransparency
      ? `${ICONS.checkCircle}<span>Fundo transparente</span>`
      : `${ICONS.warning}<span>Sem transparência</span>`;
    $('mark-warning').hidden = mark.hasTransparency;
  }

  function renderControls() {
    const p = state.preferences;
    $('placement').innerHTML = UI.PLACEMENTS.map((item) => `
      <button role="radio" aria-checked="${item.id === p.watermarkPlacement}" class="${item.id === p.watermarkPlacement ? 'selected' : ''}" data-placement="${item.id}">${item.title}</button>`).join('');
    $('scale').value = Math.round(p.watermarkScale * 100);
    $('opacity').value = Math.round(p.watermarkOpacity * 100);
    $('scale-value').textContent = UI.percent(p.watermarkScale);
    $('opacity-value').textContent = UI.percent(p.watermarkOpacity);
    $('folder-text').textContent = `As imagens com marca vão para ${UI.outputFolder(p, true)}\\, separadas das versões sem marca.`;
  }

  $('folder-icon').innerHTML = ICONS.folder;
  $('placement').addEventListener('click', (event) => {
    const button = event.target.closest('[data-placement]');
    if (button) setPlacement(button.dataset.placement);
  });
  $('scale').addEventListener('input', (event) => save({ watermarkScale: Number(event.target.value) / 100 }));
  $('opacity').addEventListener('input', (event) => save({ watermarkOpacity: Number(event.target.value) / 100 }));
  $('navigator').addEventListener('click', (event) => {
    const button = event.target.closest('[data-step]');
    if (!button) return;
    state.sampleIndex = Math.min(Math.max(0, state.sampleIndex + Number(button.dataset.step)), state.samples.length - 1);
    renderNavigator();
    schedulePreview();
  });
  $('change-mark').addEventListener('click', async () => {
    const info = await api.chooseWatermark();
    if (!info) return;
    state.watermark = info;
    renderImageInfo();
    schedulePreview();
  });
  $('done').addEventListener('click', () => api.closeWindow());
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' || (event.key === 'Enter' && !event.target.closest('button'))) api.closeWindow();
  });

  api.on('accent-color', (color) => UI.applyAccent(color));

  api.dialogInit().then((data) => {
    state.preferences = data.preferences;
    state.watermark = data.watermark;
    state.samples = data.samples;
    UI.applyAccent(data.accentColor);
    renderImageInfo();
    renderControls();
    renderNavigator();
    schedulePreview();
    document.body.dataset.ready = 'true';
  });
})();
