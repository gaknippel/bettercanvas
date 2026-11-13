// Runs at document_start. Puts the theme on <html> as classes + CSS variables
// before Canvas paints, and keeps it in sync with the popup.
'use strict';

(function () {
  const root = document.documentElement;
  const CACHE_KEY = '__shittycanvas';
  const listeners = [];

  SC.settings = SC.DEFAULTS;
  SC.themeOn = false;
  SC.onSettings = fn => listeners.push(fn);

  function apply(s) {
    SC.settings = s;
    const c = SC.notCanvas ? null : SC.colorsFor(s);
    SC.themeOn = !!c;

    root.classList.toggle('sc-on', !!c);
    root.classList.toggle('sc-dark', !!c && SC.luma(c.bg) < 0.5);
    root.classList.toggle('sc-round', s.enabled && s.rounded && !SC.notCanvas);
    root.classList.toggle('sc-font', s.enabled && !!s.font && !SC.notCanvas);

    const set = (k, v) => (v == null ? root.style.removeProperty(k) : root.style.setProperty(k, v));
    for (const k of SC.COLOR_KEYS) set('--sc-' + k, c ? c[k] : null);
    set('--sc-on-accent', c ? (SC.luma(c.accent) > 0.6 ? '#111' : '#fff') : null);
    set('--sc-nav-text', c ? (SC.luma(c.nav) > 0.6 ? '#222' : '#fff') : null);
    set('--sc-font', s.enabled && s.font ? s.font : null);

    for (const fn of listeners) {
      try { fn(s); } catch (e) { console.error('[shittyCanvas]', e); }
    }
  }

  // Fast path: storage.local is async, which is too late to avoid a white
  // flash. Keep a copy of the settings in the page's localStorage so the theme
  // can be applied synchronously on the next load.
  let cached = null;
  try { cached = JSON.parse(localStorage.getItem(CACHE_KEY)); } catch (e) {}
  apply(SC.normalize(cached));

  function remember(s) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(s)); } catch (e) {}
  }

  SC.load().then(s => { apply(s); remember(s); });

  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes.settings) return;
    const s = SC.normalize(changes.settings.newValue);
    apply(s);
    remember(s);
  });

  // *.instructure.com also hosts things that aren't Canvas. Back off there.
  function checkCanvas() {
    if (document.querySelector('#application, .ic-app, body[class*="ic-"]')) return;
    SC.notCanvas = true;
    apply(SC.settings);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', checkCanvas);
  else checkCanvas();
})();
