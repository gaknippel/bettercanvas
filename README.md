# betterCanvas

a firefox extension that is supposed to be a successor to "better campus" aka one of the worst, slimiest, money grabbing extensions ive seen on the internet.

## themes

| theme | look |
| --- | --- |
| **boolymon** (default) | bring booly into your canvas |
| **Persona 5** | larp while doing assignments |
| **Balatro** | use this theme on your steamdeck while auto-catching shiny pokemon too! |
| **RE4 Remake** | clean ui |
| **Steam 2003** | old steam 2003 w/ steam happy gif replacing university logo |
| **Custom** | make ya own themes |


## dashboard tweaks

- **due soon**: a panel with everything due in the next two weeks, grouped by day, with countdown rings that drain as deadlines get close, missing work flagged, and your course colours.
- **grades on class cards**: your current grade on each card, linking to the grades page.
- **Hide classes**: hover a class card and click **hide**. it disappears from the dashboard, the due soon list and the courses menu. bring it back from the popup.
- **hide the dashboard title bar** to get the space back.
- **fonts**: any installed font (including the bundled pixel and mono fonts) and a text weight.

## install

from source (temporary, until firefox restarts):

1. Download or clone this repo.
2. Open `about:debugging#/runtime/this-firefox`.
3. click **Load Temporary Add-on…** and pick `manifest.json`.

this is also just an unlisted extension on firefox extension store, so idk just lmk i guess if u want the real file

It runs automatically on `*.instructure.com`. If your school uses its own domain (like `canvas.myschool.edu`), open Canvas, click the toolbar icon, and press **Enable here** in the status bar.

## privacy

everything stays in your browser. grades and due dates come from canvas's own API using the session you're already logged in with; nothing is sent anywhere else. settings live in firefox's extension storage.

## project layout

```
manifest.json
popup/            settings window
src/shared.js     themes, defaults, settings storage
src/theme.js      applies the theme to the page
src/darken.js     rewrites Canvas's stylesheets to the theme's colours
src/colormap.js   the colour-mapping rules (no DOM; runs under Node too)
src/skins.css     per-theme styling (fonts, bevels, backgrounds, logos)
src/features.js   Due soon, grades on cards, hiding classes
fonts/            bundled fonts and their licences
icons/            toolbar icon and theme logos
```

adding a theme: add a preset with a `skin` key in `src/shared.js`, then a block of `html.sc-skin-<key>` rules in `src/skins.css

