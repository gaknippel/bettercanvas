# shittyCanvas

A Firefox extension that re-skins Canvas LMS with video-game themes and fixes a few things that bug you every day. No accounts, no paywall, no tracking.

## Themes

| Theme | Look |
| --- | --- |
| **boolymon** (default) | Flat greys, JetBrains Mono, black-on-yellow highlights, smiley logo |
| **Persona 5** | Black/red/white, red sidebar, halftone dots, tilted headings, ransom-note titles |
| **Balatro** | Swirling felt background, CRT scanlines, pixel fonts, chip-coloured buttons, cards that tilt on hover |
| **RE4 Remake** | Near-black menus, serif headings, glowing inventory-style selection, film grain, Fine/Caution/Danger colours |
| **Steam 2003** | Olive VGUI panels, beveled buttons, Tahoma, gold headings, animated mascot logo |
| **Custom** | Pick your own six colours (and keep the skin of whatever theme you started from) |

Pick **(Canvas default)** to keep Canvas's own colours and just use the tweaks.

Themes cover the whole site, not just the dashboard: Canvas's own stylesheets are rewritten on the fly so course pages, modules, assignments and pasted-in content all follow the theme.

## Dashboard tweaks

- **Due soon**: a panel with everything due in the next two weeks, grouped by day, with countdown rings that drain as deadlines get close, missing work flagged, and your course colours.
- **Grades on class cards**: your current grade on each card, linking to the grades page.
- **Hide classes**: hover a class card and click **Hide**. It disappears from the dashboard, the Due soon list and the Courses menu. Bring it back from the popup.
- **Hide the dashboard title bar** to get the space back.
- **Fonts**: any installed font (including the bundled pixel and mono fonts) and a text weight.

## Install

From source (temporary, until Firefox restarts):

1. Download or clone this repo.
2. Open `about:debugging#/runtime/this-firefox`.
3. Click **Load Temporary Add-on…** and pick `manifest.json`.

It runs automatically on `*.instructure.com`. If your school uses its own domain (like `canvas.myschool.edu`), open Canvas, click the toolbar icon, and press **Enable here** in the status bar.

## Privacy

Everything stays in your browser. Grades and due dates come from Canvas's own API using the session you're already logged in with; nothing is sent anywhere else. Settings live in Firefox's extension storage.

## Project layout

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

Adding a theme: add a preset with a `skin` key in `src/shared.js`, then a block of `html.sc-skin-<key>` rules in `src/skins.css`.

## Credits

Bundled fonts are under the SIL Open Font License 1.1 (licence files in `fonts/`): JetBrains Mono, Anton, Barlow Semi Condensed, Jersey 10 and Pixelify Sans.

Not affiliated with Instructure, Atlus, LocalThunk, Capcom or Valve. Theme names describe the look they're inspired by.
