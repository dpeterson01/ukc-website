# Deploying the parish site to GitHub Pages

This `site/` folder **is** the published site. It is self-contained — no build step,
no npm, no framework. Whatever is in here is what visitors see.

```
site/
├── index.html      ← the whole site (all pages, one file)
├── support.js      ← runtime that renders index.html
├── .nojekyll       ← tells GitHub Pages not to run Jekyll (required)
├── assets/
│   ├── logos/      ← brand SVGs
│   └── photos/     ← church exterior placeholders (replace with real photos)
└── _ds/            ← design-system CSS, fonts, bundle
```

## Updating the repo

1. Download this folder (Claude can hand you a `.zip`).
2. In your local clone of the Pages repo, delete the old files and drop these in
   at the **same level as the old `index.html`** — usually the repo root, or `docs/`
   if Pages is set to "main / docs".
3. Commit and push:

```bash
cd /path/to/your-pages-repo
git add -A
git commit -m "Website review updates: nav lockup, Mass schedule redesign, parish history pages"
git push origin main
```

Pages rebuilds in about a minute. Hard-refresh (⌘⇧R) to bust the CSS cache.

## Things that must stay

- `.nojekyll` — without it, GitHub ignores the `_ds/` folder because it starts
  with an underscore, and the whole site loads unstyled.
- Relative paths only. Don't add a leading `/` to `assets/…` or `_ds/…` — the site
  lives at `username.github.io/repo-name/`, not at the domain root.

## What changed in this release

- Nav shows the full parish lockup (mark + both parish names) instead of the bare circle icon.
- Larger parish and city names in the homepage hero and on both parish pages.
- "Find your way in" cards now point to the sacraments and faith formation.
- Livestream copy names the churches rather than the towns.
- **Mass times:** schedule rebuilt as day cards with churches named in text
  (colour is now only a tinted background and left border — no colour-only meaning);
  holy days of obligation listed with the U.S. dispensation note; new Funeral Mass
  and Mass of Intention section.
- Parish pages: gathering times and contact merged into one column beside a church
  photo; "Give to this parish" removed from the hero.
- **New:** a history timeline page for each parish, linked from "Our story."
- Sacraments page rewritten (7 sacraments, funeral moved to Mass times).
- Faith formation: FORMED copy trimmed, three "coming soon" registration cards.
- Contact: staff list trimmed to three, office address split from mailing address.

## Still to do

- Replace `assets/photos/*-exterior-placeholder.svg` with real photographs
  (same filenames = no code change needed).
