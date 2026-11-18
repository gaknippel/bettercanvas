'use strict';

const $ = id => document.getElementById(id);
const COLOR_LABELS = { bg: 'Page', surface: 'Panels', text: 'Text', accent: 'Accent', link: 'Links', nav: 'Sidebar' };
const CHECKS = ['rounded', 'cardGrades', 'dueList', 'hideDashHeader'];
const TAB_KEY = 'popupTab';
let settings;

function el(tag, props, children) {
  const n = Object.assign(document.createElement(tag), props || {});
  for (const c of children || []) n.append(c);
  return n;
}

// Loaded fresh each time the popup opens. The page only writes `hidden`
// (via the Hide button), which can't happen while the popup is open.
function store(patch) {
  settings = Object.assign({}, settings, patch);
  return browser.storage.local.set({ settings });
}

function update(patch) {
  store(patch);
  render();
}

// The colours shown in the wells: the active preset, or the custom set.
function shownColors() {
  return SC.PRESETS[settings.theme] || settings.custom;
}

// ---- tabs ------------------------------------------------------------

function showTab(id) {
  for (const tab of document.querySelectorAll('[role="tab"]')) {
    const on = tab.id === id;
    tab.setAttribute('aria-selected', String(on));
    tab.tabIndex = on ? 0 : -1;
    $(tab.getAttribute('aria-controls')).hidden = !on;
  }
  try { localStorage.setItem(TAB_KEY, id); } catch (e) {}
}

function initTabs() {
  const tabs = [...document.querySelectorAll('[role="tab"]')];
  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => showTab(tab.id));
    tab.addEventListener('keydown', e => {
      const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!step) return;
      const next = tabs[(i + step + tabs.length) % tabs.length];
      showTab(next.id);
      next.focus();
    });
  });
  let saved = null;
  try { saved = localStorage.getItem(TAB_KEY); } catch (e) {}
  showTab(saved && $(saved) ? saved : 'tab-theme');
}

// ---- theme list ------------------------------------------------------

function themeKeys() {
  return ['none', ...Object.keys(SC.PRESETS), 'custom'];
}

function renderThemes() {
  const box = $('themes');
  box.textContent = '';

  const swatch = c => {
    if (!c) return el('span', { className: 'swatch empty' });
    const s = el('span', { className: 'swatch' });
    for (const k of ['bg', 'surface', 'accent', 'link']) {
      const i = el('i');
      i.style.background = c[k];
      s.append(i);
    }
    return s;
  };

  for (const key of themeKeys()) {
    const colors = key === 'none' ? null : key === 'custom' ? settings.custom : SC.PRESETS[key];
    const name = key === 'none' ? '(Canvas default)' : key === 'custom' ? 'Custom' : SC.PRESETS[key].name;
    const opt = el('div', { className: 'option', id: 'theme-' + key }, [swatch(colors), name]);
    opt.setAttribute('role', 'option');
    opt.setAttribute('aria-selected', String(settings.theme === key));
    opt.addEventListener('click', () => update({ theme: key }));
    box.append(opt);
  }
  box.setAttribute('aria-activedescendant', 'theme-' + settings.theme);
}

function initThemeKeys() {
  $('themes').addEventListener('keydown', e => {
    const keys = themeKeys();
    const i = keys.indexOf(settings.theme);
    let next = null;
    if (e.key === 'ArrowDown') next = keys[Math.min(keys.length - 1, i + 1)];
    else if (e.key === 'ArrowUp') next = keys[Math.max(0, i - 1)];
    else if (e.key === 'Home') next = keys[0];
    else if (e.key === 'End') next = keys[keys.length - 1];
    if (!next) return;
    e.preventDefault();
    update({ theme: next });
    $('theme-' + next).scrollIntoView({ block: 'nearest' });
  });
}

// ---- colours ---------------------------------------------------------

function renderColors() {
  const box = $('colors');
  box.textContent = '';
  const colors = shownColors() || SC.plainColors(SC.DEFAULT_THEME);
  const off = settings.theme === 'none';
  for (const k of SC.COLOR_KEYS) {
    const input = el('input', { type: 'color', value: colors[k], disabled: off });
    // Editing any colour forks the current theme into "Custom" (keeping its skin).
    input.addEventListener('input', () => {
      store({ theme: 'custom', custom: Object.assign({}, shownColors(), { [k]: input.value }) });
      renderThemes(); // not render(): rebuilding the wells would close the open picker
    });
    box.append(el('label', { className: 'color' }, [input, COLOR_LABELS[k]]));
  }
  $('reset').disabled = settings.theme !== 'custom';
}

// ---- hidden classes --------------------------------------------------

function renderHidden() {
  const box = $('hidden');
  box.textContent = '';
  if (!settings.hidden.length) {
    box.append(el('div', { className: 'empty-text', textContent: '(none)' }));
    return;
  }
  for (const h of settings.hidden) {
    const show = el('button', { type: 'button', className: 'btn small', textContent: 'Show' });
    show.addEventListener('click', () => update({ hidden: settings.hidden.filter(x => x.id !== h.id) }));
    box.append(el('div', { className: 'hidden-row' }, [
      el('span', { className: 'name', textContent: h.name || `Course ${h.id}`, title: h.name || '' }),
      show
    ]));
  }
}

// ---- everything ------------------------------------------------------

function render() {
  $('enabled').checked = settings.enabled;
  for (const fs of document.querySelectorAll('.sheet fieldset')) fs.disabled = !settings.enabled;
  renderThemes();
  renderColors();
  renderHidden();
  $('font').value = settings.font;
  $('fontWeight').value = settings.fontWeight;
  for (const id of CHECKS) $(id).checked = settings[id];
}

// Status bar: whether the current tab is covered, and a way to cover it.
async function renderSite() {
  const bar = $('site');
  const panel = bar.querySelector('.panel');
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  let url;
  try { url = new URL(tab.url); } catch (e) { panel.textContent = 'Not a web page'; return; }
  if (!/^https?:$/.test(url.protocol)) { panel.textContent = 'Not a web page'; return; }

  const pattern = `*://${url.hostname}/*`;
  const builtIn = /(^|\.)instructure\.com$/.test(url.hostname);
  const granted = builtIn || await browser.permissions.contains({ origins: [pattern] });

  if (granted) {
    panel.textContent = 'Active on ' + url.hostname;
    panel.title = panel.textContent;
    if (!builtIn) {
      const off = el('button', { type: 'button', className: 'btn small', textContent: 'Remove' });
      off.addEventListener('click', async () => {
        await browser.permissions.remove({ origins: [pattern] });
        browser.tabs.reload(tab.id);
        window.close();
      });
      bar.append(off);
    }
    return;
  }

  panel.textContent = 'Not running on ' + url.hostname;
  panel.title = panel.textContent + '. Is this your school\'s Canvas?';
  const on = el('button', { type: 'button', className: 'btn small', textContent: 'Enable here' });
  // Must be called straight from the click. Firefox may close the popup while
  // it asks; background.js picks up the grant and reloads the tab.
  on.addEventListener('click', () => {
    browser.permissions.request({ origins: [pattern] }).then(ok => { if (ok) window.close(); });
  });
  bar.append(on);
}

async function init() {
  settings = await SC.load();

  for (const [value, label] of Object.entries(SC.FONTS)) $('font').append(el('option', { value, textContent: label }));
  for (const [value, label] of Object.entries(SC.WEIGHTS)) $('fontWeight').append(el('option', { value, textContent: label }));

  $('enabled').addEventListener('change', e => update({ enabled: e.target.checked }));
  $('font').addEventListener('change', e => update({ font: e.target.value }));
  $('fontWeight').addEventListener('change', e => update({ fontWeight: e.target.value }));
  for (const id of CHECKS) $(id).addEventListener('change', e => update({ [id]: e.target.checked }));
  $('reset').addEventListener('click', () => update({ custom: SC.plainColors(SC.DEFAULT_THEME) }));

  initTabs();
  initThemeKeys();
  render();
  renderSite();
}

init();
