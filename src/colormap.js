// Pure colour logic: decides how one Canvas colour maps onto the theme.
// No DOM access, so it also runs under Node for tests.
'use strict';

var SCColor = (function () {
  const NAMED = {
    white: [255, 255, 255, 1], black: [0, 0, 0, 1], gray: [128, 128, 128, 1], grey: [128, 128, 128, 1],
    silver: [192, 192, 192, 1], lightgray: [211, 211, 211, 1], lightgrey: [211, 211, 211, 1],
    gainsboro: [220, 220, 220, 1], whitesmoke: [245, 245, 245, 1], snow: [255, 250, 250, 1],
    ivory: [255, 255, 240, 1], darkgray: [169, 169, 169, 1], darkgrey: [169, 169, 169, 1],
    dimgray: [105, 105, 105, 1], dimgrey: [105, 105, 105, 1]
  };

  const num = s => (s.endsWith('%') ? parseFloat(s) * 2.55 : parseFloat(s));
  const alpha = s => (s == null ? 1 : s.endsWith('%') ? parseFloat(s) / 100 : parseFloat(s));

  // -> [r, g, b, a] or null for anything that isn't a plain sRGB colour
  // (var(), currentcolor, inherit, gradients...).
  function parse(str) {
    if (!str) return null;
    const s = String(str).trim().toLowerCase();
    if (NAMED[s]) return NAMED[s];

    let m = /^#([0-9a-f]{3,8})$/.exec(s);
    if (m) {
      let h = m[1];
      if (h.length === 3 || h.length === 4) h = h.replace(/./g, '$&$&');
      if (h.length !== 6 && h.length !== 8) return null;
      const n = parseInt(h.slice(0, 6), 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255, h.length === 8 ? parseInt(h.slice(6), 16) / 255 : 1];
    }

    m = /^rgba?\(\s*([\d.]+%?)[\s,]+([\d.]+%?)[\s,]+([\d.]+%?)\s*(?:[,/]\s*([\d.]+%?)\s*)?\)$/.exec(s);
    if (m) return [num(m[1]), num(m[2]), num(m[3]), alpha(m[4])];
    return null;
  }

  // lightness 0..1 and chroma 0..1 (how far from grey)
  function stats(c) {
    const max = Math.max(c[0], c[1], c[2]), min = Math.min(c[0], c[1], c[2]);
    return { l: (max + min) / 510, chroma: (max - min) / 255 };
  }

  const rgb = c => `rgb(${Math.round(c[0])}, ${Math.round(c[1])}, ${Math.round(c[2])})`;
  const V = name => `var(--sc-${name})`;
  const mix = (c, pct, into) => `color-mix(in srgb, ${rgb(c)} ${pct}%, ${into})`;
  const fade = (css, a) => (a >= 0.995 ? css : `color-mix(in srgb, ${css} ${Math.round(a * 100)}%, transparent)`);

  // Each mapper returns replacement CSS, or null to leave the colour alone.

  // Light backgrounds become theme surfaces; pale tints (alerts, highlights)
  // keep their hue but sink into the theme background.
  function bg(c) {
    if (!c || c[3] < 0.05) return null;
    const { l, chroma } = stats(c);
    if (l < 0.75) return null;
    let out;
    if (chroma < 0.045) out = l >= 0.975 ? V('bg') : l >= 0.9 ? V('surface') : V('surface-2');
    else out = mix(c, 22, V('bg'));
    return fade(out, c[3]);
  }

  // Dark greys become theme text; dark saturated colours (links, error red)
  // are pulled toward the text colour so they stay readable.
  function text(c) {
    if (!c || c[3] < 0.05) return null;
    const { l, chroma } = stats(c);
    let out;
    if (chroma < 0.16) {
      if (l < 0.36) out = V('text');
      else if (l < 0.52) out = V('text-dim');
      else return null;
    } else if (l < 0.47) out = mix(c, 55, V('text'));
    else return null;
    return fade(out, c[3]);
  }

  function border(c) {
    if (!c || c[3] < 0.05) return null;
    const { l, chroma } = stats(c);
    let out;
    if (l < 0.45 && chroma < 0.16) out = V('border');
    else if (chroma < 0.06) {
      if (l >= 0.6) out = V('border');
      else return null;
    } else if (l >= 0.75) out = mix(c, 40, V('bg'));
    else return null;
    return fade(out, c[3]);
  }

  const COLOR_TOKEN = /rgba?\([^()]*\)|#[0-9a-f]{3,8}\b|\b(?:white|black|whitesmoke|gainsboro|lightgr[ae]y|silver)\b/gi;

  // Rewrites the colour stops of a gradient. null when nothing changed.
  function gradient(value) {
    let changed = false;
    const out = value.replace(COLOR_TOKEN, tok => {
      const mapped = bg(parse(tok));
      if (!mapped) return tok;
      changed = true;
      return mapped;
    });
    return changed ? out : null;
  }

  return { parse, stats, bg, text, border, gradient };
})();

if (typeof module !== 'undefined') module.exports = SCColor;
