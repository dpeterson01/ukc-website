# Catholic Parishes of Upper Kittitas County — Website & Design System

The website and shared brand identity for two Catholic parishes in the Cascade foothills of Washington State:

- **St. John the Baptist** · Cle Elum
- **Immaculate Conception** · Roslyn

> *"Two places. One faith. One future in Christ."*

## Repository layout

```
ukc-website/
├── site/             ← the deployable static website (this is what GitHub Pages serves)
├── design-system/    ← the reusable brand foundation: tokens, fonts, logos, UI kits, brand docs
└── source/data/      ← canonical parish facts and history (also read by the ukc-bulletin repo)
```

### `site/` — the published website

A self-contained static site, **hand-edited directly**. `index.html` is the home page; it loads
its own copy of the design-system CSS/fonts under `_ds/` plus brand logos under `assets/logos/`.
The `.nojekyll` file tells GitHub Pages to serve the files as-is.

One thing to know before editing: `index.html` is a React single-page app, not flat HTML. The
page body sits inside an `<x-dc>` template that `support.js` hydrates at load, and all fourteen
pages live in that one file behind a hash router. `site/support.js` and
`site/_ds/*/_ds_bundle.js` are therefore load-bearing — deleting them blanks the site. See
`CLAUDE.md` for the details and for the planned flattening work.

New additions (such as `site/forms/`) are written as ordinary HTML, CSS, and vanilla JS with no
dependency on that runtime.

### `design-system/` — the brand foundation
The canonical, reusable design system, kept separate from the website's page-level
implementation so it stays clean and reusable for other surfaces (bulletins, newsletters,
slides). Key files:
- `colors_and_type.css` — color, type, spacing, radii, shadow, and motion tokens (source of truth)
- `fonts/` — Cormorant SC, Source Sans 3, Source Serif 4 (self-hosted .ttf)
- `assets/logos/` — the full SVG logo system
- `ui_kits/` — per-surface kits (`parish_website`, `parish_bulletin`, `parish_newsletter`)
- `README.md` — the full brand guide (voice, color, type, iconography, do's and don'ts)

### `source/data/` — canonical parish facts

`parish-facts.md` and `parish-history.md` hold the parish's canonical details: Mass times, clergy,
office hours, addresses, and the founding timeline. `parish-facts.md` carries YAML frontmatter
that the sibling `ukc-bulletin` repo reads to regenerate its `parish-config.yaml`, so update it
there and keep the frontmatter in sync with the prose.

## Local preview

```sh
cd site && python3 -m http.server 8000
# then open http://localhost:8000
```

## Fonts

`scripts/optimize-site-fonts.py` converts TTF to woff2 (~11 MB down to ~3 MB) and rewrites the
`@font-face` rules. It has already been run; re-run it only if new font files are added.

```sh
pip install fonttools brotli      # one-time
python3 scripts/optimize-site-fonts.py
```

## Deploy (GitHub Pages)

This repo is published with GitHub Pages serving the `site/` folder. See the deploy notes
once the repo is connected to a personal GitHub account.
