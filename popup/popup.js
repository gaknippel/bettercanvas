'use strict';

const $ = id => document.getElementById(id);
const COLOR_LABELS = { bg: 'Page', surface: 'Cards', text: 'Text', accent: 'Accent', link: 'Links', nav: 'Sidebar' };
let settings;

function el(tag, props, children) {
  const n = Object.assign(document.createElement(tag), props || {});
  for (const c of children || []) n.append(c);
  return n;
}

// The popup is the only writer, so keep the truth here and write it whole.
function store(patch) {
  settings = Object.assign({}, settings, patch);
  return browser.storage.local.set({ settings });
}

function update(patch) {
  store(patch);
  render();
}

// The colours shown in the pickers: the active preset, or the custom set.
function shownColors() {
  return SC.PRESETS[settings.theme] || settings.custom;
}

function renderThemes() {
  const box = $('themes');
  box.textContent = '';

  const add = (key, name, chip) => {
    const b = el('button', { type: 'button', className: 'theme' }, [chip, name]);
    b.setAttribute('aria-pressed', String(settings.theme === key));
    b.addEventListener('click', () => update({ theme: key }));
    box.append(b);
  };

  const swatch = c => {
    const chip = el('span', { className: 'chip' });
    chip.style.background = c.bg;
    for (const k of ['text', 'accent', 'link']) {
      const bar = el('i');
      bar.style.background = c[k];
      chip.append(bar);
    }
    return chip;
  };

  add('none', 'Canvas', el('span', { className: 'chip plain', textContent: '∅' }));
  for (const [key, p] of Object.entries(SC.PRESETS)) add(key, p.name, swatch(p));
  add('custom', 'Custom', swatch(settings.custom));
}

function renderColors() {
  const box = $('colors');
  box.textContent = '';
  const colors = shownColors();
  for (const k of SC.COLOR_KEYS) {
    const input = el('input', { type: 'color', value: colors[k] });
    // Editing any colour forks the current theme into "Custom".
    input.addEventListener('input', () => {
      store({ theme: 'custom', custom: Object.assign({}, shownColors(), { [k]: input.value }) });
      renderThemes(); // not render(): rebuilding the pickers would close the open one
    });
    box.append(el('label', { className: 'color' }, [input, COLOR_LABELS[k]]));
  }
}

function render() {
  $('enabled').checked = settings.enabled;
  $('main').classList.toggle('off', !settings.enabled);
  renderThemes();
  renderColors();
  $('font').value = settings.font;
  for (const id of ['rounded', 'cardGrades', 'dueList']) $(id).checked = settings[id];
}

// Tell the user whether the current tab is covered, and offer to cover it.
async function renderSite() {
  const foot = $('site');
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  let url;
  try { url = new URL(tab.url); } catch (e) { return; }
  if (!/^https?:$/.test(url.protocol)) return;

  const pattern = `*://${url.hostname}/*`;
  const builtIn = /(^|\.)instructure\.com$/.test(url.hostname);
  const granted = builtIn || await browser.permissions.contains({ origins: [pattern] });

  foot.textContent = '';
  if (granted) {
    foot.append('Active on ', el('b', { textContent: url.hostname }));
    if (!builtIn) {
      const off = el('button', { type: 'button', className: 'link', textContent: ' (remove)' });
      off.addEventListener('click', async () => {
        await browser.permissions.remove({ origins: [pattern] });
        browser.tabs.reload(tab.id);
        window.close();
      });
      foot.append(off);
    }
    return;
  }

  foot.append('Not running on ', el('b', { textContent: url.hostname }), '. Is this your school\'s Canvas?');
  const on = el('button', { type: 'button', textContent: 'Enable on this site' });
  // Must be called straight from the click. Firefox may close the popup while
  // it asks; background.js picks up the grant and reloads the tab.
  on.addEventListener('click', () => {
    browser.permissions.request({ origins: [pattern] }).then(ok => { if (ok) window.close(); });
  });
  foot.append(on);
}

async function init() {
  settings = await SC.load();

  for (const [value, label] of Object.entries(SC.FONTS)) $('font').append(el('option', { value, textContent: label }));

  $('enabled').addEventListener('change', e => update({ enabled: e.target.checked }));
  $('font').addEventListener('change', e => update({ font: e.target.value }));
  for (const id of ['rounded', 'cardGrades', 'dueList']) {
    $(id).addEventListener('change', e => update({ [id]: e.target.checked }));
  }
  $('reset').addEventListener('click', () => update({ theme: 'midnight', custom: Object.assign({}, SC.PRESETS.midnight) }));

  render();
  renderSite();
}

init();
