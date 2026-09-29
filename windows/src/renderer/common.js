'use strict';

// Utilitários compartilhados pela janela principal e pela janela da marca.

window.UI = {
  QUALITY_PRESETS: [
    { id: 'alta', title: 'Alta', quality: 90, subtitle: 'Preserva detalhe fino; ideal para impressão e portfólio.' },
    { id: 'media', title: 'Média', quality: 82, subtitle: 'O equilíbrio para web e e-commerce. Recomendado.' },
    { id: 'leve', title: 'Leve', quality: 70, subtitle: 'Arquivos bem menores; ótimo para miniaturas e catálogos.' },
  ],
  PLACEMENTS: [
    { id: 'centro', title: 'Centro', defaultScale: 0.6 },
    { id: 'repetida', title: 'Repetida', defaultScale: 0.28 },
    { id: 'canto', title: 'Canto', defaultScale: 0.22 },
  ],

  escape(text) {
    return String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  },

  /** Tamanho no formato brasileiro, em unidades decimais como no app Mac. */
  bytes(value) {
    const number = (v, digits) => v.toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
    if (value < 1e6) return `${number(Math.max(0, Math.round(value / 1e3)), 0)} KB`;
    if (value < 1e9) return `${number(value / 1e6, 1)} MB`;
    return `${number(value / 1e9, 2)} GB`;
  },

  percent: (fraction) => `${Math.round(fraction * 100)}%`,
  imageCount: (count) => (count === 1 ? '1 imagem' : `${count.toLocaleString('pt-BR')} imagens`),

  baseName(file) {
    return String(file).split(/[\\/]/).pop();
  },

  directoryName(file) {
    const parts = String(file).split(/[\\/]/);
    parts.pop();
    return parts.join(file.includes('\\') ? '\\' : '/');
  },

  outputFolder(preferences, withWatermark) {
    const base = String(preferences.outputFolderName || '').trim() || 'webp';
    return withWatermark ? `${base}-amostra` : base;
  },

  /**
   * Usa a cor de destaque escolhida nas configurações do Windows — como o app Mac
   * usa a do macOS — e escolhe texto claro ou escuro para ficar legível sobre ela.
   */
  applyAccent(hex) {
    if (!/^#[0-9a-f]{6}$/i.test(hex || '')) return;
    const channel = (i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    const luminance = 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
    const root = document.documentElement.style;
    root.setProperty('--accent', hex);
    root.setProperty('--accent-contrast', luminance > 0.45 ? '#000000' : '#ffffff');
  },
};
