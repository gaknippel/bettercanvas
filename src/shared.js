// Shared by content scripts and the popup: presets, defaults, settings storage.
'use strict';

var SC = (function () {
  // Each theme is six colours. Everything else (borders, dim text, hover
  // surfaces) is derived from these in theme.css with color-mix().
  const PRESETS = {
    midnight: { name: 'Midnight', bg: '#0f1115', surface: '#181b21', text: '#e4e6eb', accent: '#4f8cff', link: '#7fb0ff', nav: '#090b0e' },
    graphite: { name: 'Graphite', bg: '#1c1c1e', surface: '#262629', text: '#ececec', accent: '#ff9f0a', link: '#ffb84d', nav: '#131314' },
    mocha:    { name: 'Mocha',    bg: '#1e1e2e', surface: '#28283d', text: '#cdd6f4', accent: '#cba6f7', link: '#89b4fa', nav: '#181825' },
    dracula:  { name: 'Dracula',  bg: '#282a36', surface: '#343746', text: '#f8f8f2', accent: '#bd93f9', link: '#8be9fd', nav: '#21222c' },
    forest:   { name: 'Forest',   bg: '#111a15', surface: '#18241d', text: '#dbe7df', accent: '#4caf7a', link: '#7fd3a2', nav: '#0b120e' },
    paper:    { name: 'Paper',    bg: '#faf7f2', surface: '#f0ebe1', text: '#2b2a27', accent: '#b4552d', link: '#9a4420', nav: '#2b2a27' }
  };

  const COLOR_KEYS = ['bg', 'surface', 'text', 'accent', 'link', 'nav'];

  const FONTS = {
    '': 'Canvas default',
    'system-ui, sans-serif': 'System UI',
    'Inter, system-ui, sans-serif': 'Inter',
    'Georgia, "Times New Roman", serif': 'Serif',
    '"JetBrains Mono", "Cascadia Code", Consolas, monospace': 'Monospace',
    '"Atkinson Hyperlegible", Verdana, sans-serif': 'Atkinson / Verdana',
    '"Comic Sans MS", "Comic Neue", cursive': 'Comic Sans'
  };

  const DEFAULTS = {
    enabled: true,          // master switch
    theme: 'midnight',      // preset key, 'custom', or 'none' (keep Canvas colours)
    custom: Object.assign({}, PRESETS.midnight),
    font: '',
    rounded: true,
    cardGrades: true,
    dueList: true
  };

  function normalize(s) {
    const out = Object.assign({}, DEFAULTS, s || {});
    out.custom = Object.assign({}, DEFAULTS.custom, (s && s.custom) || {});
    return out;
  }

  async function load() {
    const got = await browser.storage.local.get('settings');
    return normalize(got.settings);
  }

  async function save(patch) {
    const next = Object.assign(await load(), patch);
    await browser.storage.local.set({ settings: next });
    return next;
  }

  // Colours for the active theme, or null when the theme is off.
  function colorsFor(s) {
    if (!s.enabled || s.theme === 'none') return null;
    if (s.theme === 'custom') return s.custom;
    return PRESETS[s.theme] || PRESETS.midnight;
  }

  function hexToRgb(hex) {
    let h = String(hex).replace('#', '');
    if (h.length === 3) h = h.replace(/./g, '$&$&');
    const n = parseInt(h.slice(0, 6), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  // Perceived brightness, 0 (black) to 1 (white).
  function luma(hex) {
    const [r, g, b] = hexToRgb(hex);
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  }

  return { PRESETS, COLOR_KEYS, FONTS, DEFAULTS, normalize, load, save, colorsFor, hexToRgb, luma };
})();
