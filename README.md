# Catholic Parishes of Upper Kittitas County — Website & Design System

The website and shared brand identity for two Catholic parishes in the Cascade foothills of Washington State:

- **St. John the Baptist** · Cle Elum
- **Immaculate Conception** · Roslyn

> *"Two places. One faith. One future in Christ."*

## Repository layout

```
upper-kittitas-parishes/
├── site/             ← the deployable static website (this is what GitHub Pages serves)
├── design-system/    ← the reusable brand foundation: tokens, fonts, logos, UI kits, brand docs
└── source/           ← the editable Claude Design source (.dc.html, parish facts, uploads)
```

### `site/` — the published website
A self-contained static site. `index.html` is the home page; it loads its own copy of the
design-system CSS/fonts under `_ds/` plus brand logos under `assets/logos/`. The `.nojekyll`
file tells GitHub Pages to serve the files as-is. **Don't hand-edit this folder for content
changes** — re-export from Claude Design and refresh it (see below).

### `design-system/` — the brand foundation
The canonical, reusable design system, kept separate from the website's page-level
implementation so it stays clean and reusable for other surfaces (bulletins, newsletters,
slides). Key files:
- `colors_and_type.css` — color, type, spacing, radii, shadow, and motion tokens (source of truth)
- `fonts/` — Cormorant SC, Source Sans 3, Source Serif 4 (self-hosted .ttf)
- `assets/logos/` — the full SVG logo system
- `ui_kits/` — per-surface kits (`parish_website`, `parish_bulletin`, `parish_newsletter`)
- `README.md` — the full brand guide (voice, color, type, iconography, do's and don'ts)

### `source/` — editable source
The Claude Design project source: the `.dc.html` page documents, `data/parish-facts.md`,
and `uploads/`. Edit the design in Claude Design, then re-export and refresh `site/`.

## Local preview

```sh
cd site && python3 -m http.server 8000
# then open http://localhost:8000
```

## Updating the site from a new Claude Design export

When you re-export the project from Claude Design (`Export → project archive .zip`):

1. Refresh `site/` and `source/` from the new archive (replace their contents).
2. Re-run the font optimization (the export ships ~11 MB of `.ttf`; this converts them
   to woff2, ~3 MB, and rewrites the `@font-face` rules):
   ```sh
   pip install fonttools brotli      # one-time
   python3 scripts/optimize-site-fonts.py
   ```
3. `design-system/README.md` is maintained **here**, not in Claude Design — don't
   overwrite it from the export.
4. Commit and push — the GitHub Actions workflow redeploys automatically.

## Deploy (GitHub Pages)

This repo is published with GitHub Pages serving the `site/` folder. See the deploy notes
once the repo is connected to a personal GitHub account.
