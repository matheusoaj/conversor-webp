'use strict';

// Ícones em SVG no lugar dos SF Symbols do app Mac. Usam `currentColor`, então
// herdam a cor do texto ao redor; `.glyph` é o traço interno dos ícones cheios.

const ICON_STROKE = 'fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"';

window.ICONS = {
  // photo.on.rectangle.angled
  photos: `<svg viewBox="0 0 24 24" ${ICON_STROKE}>
    <path d="M7 6.2V5.5A1.5 1.5 0 0 1 8.5 4h11A1.5 1.5 0 0 1 21 5.5v9a1.5 1.5 0 0 1-1.5 1.5H18.2"/>
    <rect x="3" y="7.8" width="15.2" height="12.2" rx="1.6"/>
    <circle cx="7.6" cy="11.8" r="1.3"/>
    <path d="M3.4 18.3l4.3-4.1 3 2.8 2.6-2.4 4.6 4.2"/></svg>`,
  image: `<svg viewBox="0 0 24 24" ${ICON_STROKE}>
    <path d="M6.5 3h7.5l4.5 4.5V20a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/>
    <path d="M14 3v4.5h4.5"/><path d="M8 17.5l2.5-3 2 2 1.4-1.4 2.1 2.4"/></svg>`,
  xCircleFill: `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9.5" fill="currentColor"/>
    <path class="glyph" d="M9 9l6 6M15 9l-6 6" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  checkCircleFill: `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="currentColor"/>
    <path class="glyph" d="M7.4 12.4l3.1 3.1 6.1-6.6" fill="none" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  warningFill: `<svg viewBox="0 0 24 24"><path d="M10.3 3.9a2 2 0 0 1 3.4 0l8.1 13.7a2 2 0 0 1-1.7 3H3.9a2 2 0 0 1-1.7-3z" fill="currentColor"/>
    <path class="glyph" d="M12 9v4.8" stroke-width="2" stroke-linecap="round"/><circle class="glyph-fill" cx="12" cy="17.1" r="1.2"/></svg>`,
  warning: `<svg viewBox="0 0 24 24" ${ICON_STROKE}><path d="M10.3 3.9a2 2 0 0 1 3.4 0l8.1 13.7a2 2 0 0 1-1.7 3H3.9a2 2 0 0 1-1.7-3z"/>
    <path d="M12 9.5v4"/><path d="M12 17h.01"/></svg>`,
  checkCircle: `<svg viewBox="0 0 24 24" ${ICON_STROKE}><circle cx="12" cy="12" r="9"/><path d="M8.3 12.3l2.5 2.5 5-5.3"/></svg>`,
  xCircle: `<svg viewBox="0 0 24 24" ${ICON_STROKE}><circle cx="12" cy="12" r="9"/><path d="M9.2 9.2l5.6 5.6M14.8 9.2l-5.6 5.6"/></svg>`,
  arrowRight: `<svg viewBox="0 0 24 24" ${ICON_STROKE}><path d="M5 12h14M13 6l6 6-6 6"/></svg>`,
  chevronLeft: `<svg viewBox="0 0 24 24" ${ICON_STROKE}><path d="M15 18l-6-6 6-6"/></svg>`,
  chevronRight: `<svg viewBox="0 0 24 24" ${ICON_STROKE}><path d="M9 18l6-6-6-6"/></svg>`,
  folder: `<svg viewBox="0 0 24 24" ${ICON_STROKE}><path d="M3 7.2A2.2 2.2 0 0 1 5.2 5h3.6l2.2 2.2h7.8A2.2 2.2 0 0 1 21 9.4v7.4a2.2 2.2 0 0 1-2.2 2.2H5.2A2.2 2.2 0 0 1 3 16.8z"/></svg>`,
  turnDownRight: `<svg viewBox="0 0 24 24" ${ICON_STROKE}><path d="M6 4v6.5A3.5 3.5 0 0 0 9.5 14H19"/><path d="M15 10l4 4-4 4"/></svg>`,
};
