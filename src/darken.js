// The theme engine. Canvas hard-codes most of its colours, so instead of
// hand-writing an override for every page, read Canvas's own stylesheets and
// generate a themed twin of each one: same selectors, same order, colours
// swapped for theme variables. The twin is inserted right after its source, so
// the cascade (hover states, modifiers, !important) behaves exactly as before.
'use strict';

(function () {
  const ENGINE = 1; // bump to invalidate cached output when the mapping changes
  const C = SCColor;
  const BORDER = /^border-(top|right|bottom|left|block-start|block-end|inline-start|inline-end)-color$/;
  const SINGLE_VAR = /^var\([^()]*\)$/;

  const tracked = new Map(); // source <link>/<style> -> { out, len }
  let active = false;
  let observer = null;
  let pollTimer = null;
  let debounce = null;
  let pendingLinks = 0; // stylesheets still being fetched/themed
  let dirty = true;     // DOM changed since the last computed-style sweep

  // ---- rule generation -------------------------------------------------

  // The twin sheet lives in the page, not next to the original file, so
  // relative url()s have to be made absolute.
  function absolutize(value, base) {
    return value.replace(/url\(\s*(['"]?)(.*?)\1\s*\)/g, (m, q, u) => {
      if (/^(data:|#)/.test(u)) return m;
      try { return `url("${new URL(u, base).href}")`; } catch (e) { return m; }
    });
  }

  function declsFor(st, base) {
    let out = '';
    let borderDone = false;
    for (let i = 0; i < st.length; i++) {
      const p = st.item(i);
      let map;
      if (p === 'color' || p === 'fill' || p === 'stroke') map = C.text;
      else if (p === 'background-color') map = C.bg;
      else if (BORDER.test(p)) map = C.border;
      else if (p !== 'background-image') continue;

      const v = st.getPropertyValue(p);
      const pri = st.getPropertyPriority(p) ? ' !important' : '';

      if (p === 'background-image') {
        if (!v) continue;
        out += `${p}:${(v.includes('gradient(') && C.gradient(v)) || absolutize(v, base)}${pri};`;
        continue;
      }

      if (!v) {
        // Set through a shorthand containing var(): the longhand can't be read.
        if (p === 'background-color') {
          const sh = st.getPropertyValue('background').trim();
          if (SINGLE_VAR.test(sh)) out += `background-color:${sh}${pri};`;
        } else if (map === C.border && !borderDone) {
          const sh = st.getPropertyValue('border-color').trim();
          if (sh) out += `border-color:${sh}${pri};`;
          borderDone = true;
        }
        continue;
      }

      // Unchanged colours are re-emitted too. Otherwise a themed rule could
      // win over a later Canvas rule it used to lose to.
      out += `${p}:${map(C.parse(v)) || v}${pri};`;
    }
    return out;
  }

  function build(rules, from, base) {
    let css = '';
    for (let i = from || 0; i < rules.length; i++) {
      const r = rules[i];
      try {
        if (r.selectorText && r.style) {
          const d = declsFor(r.style, base);
          if (d) css += `${r.selectorText}{${d}}`;
        } else if (r.cssRules && r.type !== 7 /* keyframes */) {
          let head = null;
          if (r.media) head = `@media ${r.media.mediaText}`;
          else if (r.conditionText != null) head = `@supports ${r.conditionText}`;
          else if (r.type === 0 && r.name != null) head = `@layer ${r.name}`;
          if (head) {
            const inner = build(r.cssRules, 0, base);
            if (inner) css += `${head}{${inner}}`;
          }
        }
      } catch (e) { /* one odd rule shouldn't sink the sheet */ }
    }
    return css;
  }

  // Parse CSS text into a rule list without applying it to the page.
  function parseText(text) {
    try {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(text);
      if (sheet.cssRules.length) return { rules: sheet.cssRules, done() {} };
    } catch (e) {}
    const tmp = document.createElement('style');
    tmp.dataset.sc = 'tmp';
    tmp.media = 'not all';
    tmp.textContent = text;
    document.documentElement.appendChild(tmp);
    return { rules: tmp.sheet ? tmp.sheet.cssRules : [], done: () => tmp.remove() };
  }

  // ---- sheet tracking --------------------------------------------------

  function makeOut(src) {
    const out = document.createElement('style');
    out.dataset.sc = 'auto';
    const media = src.getAttribute('media');
    if (media) out.media = media;
    src.after(out);
    return out;
  }

  async function processLink(link) {
    const href = link.href;
    if (!href || !/^https?:/.test(href)) return;
    const rec = { out: null, len: 0 };
    tracked.set(link, rec);
    pendingLinks++;
    try { await themeLink(link, rec, href); }
    finally { pendingLinks--; dirty = true; schedule(); }
  }

  async function themeLink(link, rec, href) {

    const key = `css:${ENGINE}:${href}`;
    let css;
    try {
      css = (await browser.storage.local.get(key))[key];
      if (css == null) {
        const res = await fetch(href, { credentials: 'omit' });
        if (!res.ok) throw new Error(res.status);
        const parsed = parseText(await res.text());
        css = build(parsed.rules, 0, href);
        parsed.done();
        browser.storage.local.set({ [key]: css }).catch(() => {});
      }
    } catch (e) {
      console.warn('[shittyCanvas] could not theme', href, e);
      return;
    }
    if (!active || !link.isConnected || !css || tracked.get(link) !== rec) return;
    rec.out = makeOut(link);
    rec.out.textContent = css;
  }

  // Inline <style> tags, including the ones Canvas's React components fill
  // at runtime via insertRule (so they have rules but no text).
  function processStyle(style) {
    let rules;
    try { rules = style.sheet && style.sheet.cssRules; } catch (e) { return; }
    if (!rules) return;
    let rec = tracked.get(style);
    if (!rec) tracked.set(style, (rec = { out: null, len: 0 }));
    if (rules.length === rec.len) return;

    const append = rec.out && rules.length > rec.len;
    const css = build(rules, append ? rec.len : 0, document.baseURI);
    rec.len = rules.length;
    if (!rec.out) {
      if (!css) return;
      rec.out = makeOut(style);
    }
    if (append) { if (css) rec.out.append(css); }
    else rec.out.textContent = css;
    dirty = true;
  }

  function isOurs(el) { return el.dataset && el.dataset.sc; }

  function scan() {
    for (const el of document.querySelectorAll('link[rel~="stylesheet"], style')) {
      if (isOurs(el)) continue;
      if (el.localName === 'style') processStyle(el);
      else if (!tracked.has(el)) processLink(el);
    }
    for (const [src, rec] of tracked) {
      if (src.isConnected) continue;
      if (rec.out) rec.out.remove();
      tracked.delete(src);
    }
    sweepInline();
    sweepComputed();
  }

  // ---- inline style="" colours ----------------------------------------
  // Teachers paste content with hard-coded black text / white backgrounds.

  const inlineOrig = new WeakMap();
  const INLINE = [['color', C.text], ['background-color', C.bg]];

  function sweepInline() {
    for (const el of document.querySelectorAll('[style*="color"], [style*="background"]')) {
      if (el === document.documentElement || isOurs(el)) continue;
      let rec = inlineOrig.get(el);
      for (const [prop, map] of INLINE) {
        const cur = el.style.getPropertyValue(prop);
        if (!cur || (rec && rec[prop] && rec[prop].mapped === cur)) continue;
        const mapped = map(C.parse(cur));
        if (!mapped) continue;
        if (!rec) inlineOrig.set(el, (rec = {}));
        const orig = { value: cur, pri: el.style.getPropertyPriority(prop) };
        el.style.setProperty(prop, mapped, 'important');
        rec[prop] = { orig, mapped: el.style.getPropertyValue(prop) };
        el.setAttribute('data-sc-inline', '');
      }
    }
  }

  function restoreInline() {
    for (const el of document.querySelectorAll('[data-sc-inline]')) {
      const rec = inlineOrig.get(el);
      for (const prop in rec || {}) {
        if (el.style.getPropertyValue(prop) === rec[prop].mapped) {
          el.style.setProperty(prop, rec[prop].orig.value, rec[prop].orig.pri);
        }
      }
      inlineOrig.delete(el);
      el.removeAttribute('data-sc-inline');
    }
  }

  // ---- computed-style safety net ----------------------------------------
  // Some light colours get past the stylesheet twins: colours kept in CSS
  // custom properties, sheets that failed to fetch, styles set from script.
  // On dark themes, once the twins are in, check what actually rendered and
  // pin anything still light (background) or dark (text) to the theme.
  // Elements the twins already handled render dark and are left alone, so
  // their hover/focus states keep working.
  //
  // Left alone on purpose:
  //  - dark text sitting on a light background (accent buttons, badges);
  //  - anything a skin marks with `--sc-keep: 1` (inherited, so it covers
  //    the element's children too), e.g. Persona 5's white text boxes.

  const HTML_NS = 'http://www.w3.org/1999/xhtml';
  const SKIP = new Set(['img', 'video', 'canvas', 'iframe', 'picture', 'source', 'script', 'style',
    'link', 'meta', 'br', 'hr', 'noscript', 'template', 'option', 'embed', 'object']);
  const computedOrig = new WeakMap();
  let lastSweep = 0; // throttle: busy React pages mutate constantly

  function pin(el, prop, mapped) {
    let rec = computedOrig.get(el);
    if (!rec) computedOrig.set(el, (rec = {}));
    rec[prop] = { value: el.style.getPropertyValue(prop), pri: el.style.getPropertyPriority(prop) };
    el.style.setProperty(prop, mapped, 'important');
    el.setAttribute('data-sc-fixed', '');
  }

  function sweepComputed() {
    if (!document.documentElement.classList.contains('sc-dark')) { restoreComputed(); return; }
    if (!dirty || pendingLinks > 0 || !document.body) return;
    if (Date.now() - lastSweep < 1000) return; // the 1.5s poll picks it up
    lastSweep = Date.now();
    dirty = false;

    // What an element's text actually sits on: its own background if it has
    // one, otherwise its parent's. Cached per sweep; computed after any pin.
    const under = new Map();
    function backdrop(el) {
      if (!el || el.nodeType !== 1) return [0, 0, 0, 1];
      if (under.has(el)) return under.get(el);
      const c = C.parse(getComputedStyle(el).backgroundColor);
      const v = c && c[3] > 0.5 ? c : backdrop(el.parentElement);
      under.set(el, v);
      return v;
    }

    const all = document.body.getElementsByTagName('*');
    for (let i = 0; i < all.length; i++) {
      const el = all[i];
      if (el.namespaceURI !== HTML_NS || SKIP.has(el.localName) || isOurs(el)) continue;
      const cs = getComputedStyle(el);
      if (cs.getPropertyValue('--sc-keep').trim() === '1') continue;
      const rec = computedOrig.get(el) || {};

      if (!rec['background-color']) {
        const mapped = C.bg(C.parse(cs.backgroundColor));
        if (mapped) pin(el, 'background-color', mapped);
      }
      if (!rec.color) {
        const mapped = C.text(C.parse(cs.color));
        if (mapped && C.stats(backdrop(el)).l < 0.45) pin(el, 'color', mapped);
      }
    }
  }

  function restoreComputed() {
    for (const el of document.querySelectorAll('[data-sc-fixed]')) {
      const rec = computedOrig.get(el);
      for (const prop in rec || {}) el.style.setProperty(prop, rec[prop].value, rec[prop].pri);
      computedOrig.delete(el);
      el.removeAttribute('data-sc-fixed');
    }
  }

  // ---- lifecycle -------------------------------------------------------

  function schedule() {
    dirty = true;
    if (debounce) return;
    debounce = setTimeout(() => { debounce = null; if (active) scan(); }, 60);
  }

  function start() {
    if (active) return;
    active = true;
    scan();
    observer = new MutationObserver(schedule);
    observer.observe(document.documentElement, {
      childList: true, subtree: true, attributes: true, attributeFilter: ['style']
    });
    // insertRule() doesn't trigger mutation observers, so also poll.
    pollTimer = setInterval(scan, 1500);
  }

  function stop() {
    if (!active) return;
    active = false;
    observer.disconnect();
    clearInterval(pollTimer);
    clearTimeout(debounce);
    debounce = null;
    for (const rec of tracked.values()) if (rec.out) rec.out.remove();
    tracked.clear();
    restoreInline();
    restoreComputed();
  }

  SC.onSettings(() => (SC.themeOn ? start() : stop()));
  if (SC.themeOn) start();
})();
