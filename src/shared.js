// Shared by content scripts and the popup: presets, defaults, settings storage.
'use strict';

var SC = (function () {
  // Each theme is six colours. Everything else (borders, dim text, hover
  // surfaces) is derived from these in theme.css with color-mix(). `skin`
  // also switches on a matching layer in skins.css.
  const PRESETS = {
    boolymon: { name: 'boolymon',   bg: '#4f4f4f', surface: '#575757', text: '#ececec', accent: '#f2e00d', link: '#f3e45a', nav: '#404040', skin: 'boolymon' },
    persona5: { name: 'Persona 5',  bg: '#0d0d0d', surface: '#1a1a1a', text: '#f7f7f7', accent: '#e5191c', link: '#ff5254', nav: '#d10018', skin: 'persona5' },
    balatro:  { name: 'Balatro',    bg: '#1d3b36', surface: '#33464a', text: '#f4f1e8', accent: '#fe5f55', link: '#fda200', nav: '#141d1e', skin: 'balatro' },
    re4r:     { name: 'RE4 Remake', bg: '#0c0c0b', surface: '#161514', text: '#d9d4c7', accent: '#a8874f', link: '#d6bd86', nav: '#070706', skin: 're4r' },
    steam03:  { name: 'Steam 2003', bg: '#4c5844', surface: '#5a6a50', text: '#dedfd6', accent: '#958831', link: '#c4b550', nav: '#3e4637', skin: 'steam03' }
  };

  const DEFAULT_THEME = 'boolymon';

  // Starting point for the Custom theme: the default's colours, no skin.
  function plainColors(key) {
    const out = {};
    for (const k of ['bg', 'surface', 'text', 'accent', 'link', 'nav']) out[k] = PRESETS[key][k];
    return out;
  }

  const COLOR_KEYS = ['bg', 'surface', 'text', 'accent', 'link', 'nav'];

  const FONTS = {
    '': 'Canvas default',
    'system-ui, sans-serif': 'System UI',
    'Inter, system-ui, sans-serif': 'Inter',
    'Metropolis, system-ui, sans-serif': 'Metropolis',
    '"Pixelify Sans", system-ui, sans-serif': 'Pixelify Sans (pixel)',
    'Georgia, "Times New Roman", serif': 'Serif',
    '"JetBrains Mono", "Cascadia Code", Consolas, monospace': 'Monospace',
    '"Atkinson Hyperlegible", Verdana, sans-serif': 'Atkinson / Verdana',
    '"Comic Sans MS", "Comic Neue", cursive': 'Comic Sans'
  };

  // Base text weight. Bold text (headings, <b>) keeps its own weight.
  const WEIGHTS = {
    '': 'Default',
    '100': 'Thin',
    '200': 'Extra light',
    '300': 'Light',
    '400': 'Regular',
    '500': 'Medium',
    '600': 'Semibold',
    '700': 'Bold'
  };

  const DEFAULTS = {
    enabled: true,          // master switch
    theme: DEFAULT_THEME,   // preset key, 'custom', or 'none' (keep Canvas colours)
    custom: plainColors(DEFAULT_THEME),
    font: '',
    fontWeight: '',
    rounded: true,
    cardGrades: true,
    dueList: true,
    hideDashHeader: true,   // hide the "Dashboard" title bar / view switcher
    hidden: []              // classes hidden from the dashboard: [{ id, name }]
  };

  function normalize(s) {
    const out = Object.assign({}, DEFAULTS, s || {});
    out.custom = Object.assign({}, DEFAULTS.custom, (s && s.custom) || {});
    out.hidden = Array.isArray(out.hidden) ? out.hidden : [];
    // Saved theme might be one that no longer exists.
    if (!PRESETS[out.theme] && out.theme !== 'custom' && out.theme !== 'none') out.theme = DEFAULT_THEME;
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
    return PRESETS[s.theme] || PRESETS[DEFAULT_THEME];
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

  return { PRESETS, DEFAULT_THEME, plainColors, COLOR_KEYS, FONTS, WEIGHTS, DEFAULTS, normalize, load, save, colorsFor, hexToRgb, luma };
})();
