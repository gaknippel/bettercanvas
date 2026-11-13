// Schools on their own domain (canvas.myschool.edu) aren't covered by the
// manifest's *.instructure.com match. When the user enables one from the
// popup, Firefox grants a host permission; this registers the same content
// scripts for every granted origin.
'use strict';

const BUILT_IN = '*://*.instructure.com/*';
const registered = new Map(); // origin pattern -> [registrations]

async function sync() {
  const { origins = [] } = await browser.permissions.getAll();
  const wanted = new Set(origins.filter(o => o !== BUILT_IN));

  for (const [origin, regs] of registered) {
    if (wanted.has(origin)) continue;
    regs.forEach(r => r.unregister());
    registered.delete(origin);
  }

  for (const origin of wanted) {
    if (registered.has(origin)) continue;
    registered.set(origin, []); // reserve before awaiting
    const regs = await Promise.all([
      browser.contentScripts.register({
        matches: [origin],
        css: [{ file: '/src/theme.css' }, { file: '/src/features.css' }],
        js: [{ file: '/src/shared.js' }, { file: '/src/colormap.js' }, { file: '/src/theme.js' }, { file: '/src/darken.js' }],
        runAt: 'document_start'
      }),
      browser.contentScripts.register({
        matches: [origin],
        js: [{ file: '/src/features.js' }],
        runAt: 'document_idle'
      })
    ]);
    registered.set(origin, regs);
  }
}

browser.permissions.onAdded.addListener(async () => {
  await sync();
  // The popup that asked for this is usually gone by now; reload the tab the
  // user was looking at so the theme shows up.
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (tab) browser.tabs.reload(tab.id);
});
browser.permissions.onRemoved.addListener(sync);
sync();

// Themed stylesheets are cached per Canvas CSS file, and Canvas ships new
// file names every release. Drop the cache when it piles up.
browser.storage.local.get(null).then(all => {
  const keys = Object.keys(all).filter(k => k.startsWith('css:'));
  if (keys.length > 80) browser.storage.local.remove(keys);
});
