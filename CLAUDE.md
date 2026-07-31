# Website repo — working notes for Claude Code

Holds two areas: `site/` (the deployable static site, hand-edited) and `design-system/`
(reusable brand foundation). Account and git-identity conventions are inherited from
`~/projects/personal/CLAUDE.md` — this is the personal account **`dpeterson01`**.

## Source of truth: this repo

Claude Design was retired as the authoring workflow on 2026-07-29. There are no more project
archive exports, and **`site/` is now hand-edited directly**. Nothing overwrites it.

The old refresh procedure did `rsync -a --delete` into `site/`. Do not resurrect it. Anything
hand-written in `site/` would be destroyed.

## `source/data/` stays — another repo reads it

The Claude Design artifacts under `source/` (the `.dc.html` documents, its copy of `support.js`,
and `uploads/`) were removed; recover them from git history if ever needed. **`source/data/` was
kept**, because it is canonical parish data rather than design source, and
`ukc-bulletin/render/sync-parish-facts.mjs` reads `../ukc-website/source/data/parish-facts.md` to
regenerate `parish-config.yaml`.

Edit `source/data/parish-facts.md` when parish facts change (Mass times, clergy, office hours),
and keep its YAML frontmatter in sync with the prose below it. Moving this folder to a tidier path
means updating `ukc-bulletin` in the same change.

## Fourteen static pages, no runtime

`site/index.html` used to be a React single-page app: the whole body sat inside an `<x-dc>`
template that `support.js` hydrated, pulling React 18.3.1 from `unpkg.com` at runtime, with all
fourteen pages behind a hash router. That was flattened on 2026-07-29.

Each page is now its own file at its own URL:

```
site/index.html          site/sacraments/index.html
site/new/index.html      site/formation/index.html
site/mass/index.html     site/giving/index.html
site/about/index.html    site/watch/index.html
site/sjb/index.html      site/contact/index.html
site/ic/index.html       site/prayer/index.html
site/sjb-history/index.html
site/ic-history/index.html
```

Two more were added later under `site/forms/`, so the count is sixteen. These files **are the
source**. Edit them directly. `support.js`, `_ds_bundle.js`, and `ContactForm.dc.html` are gone,
so the site no longer depends on `unpkg.com`, and every page has its own indexable URL and
canonical link.

The interactivity React used to provide now lives in three hand-written files:

- `site/assets/site.js` — mobile nav drawer, the contact form's reason-driven conditional fields,
  chip toggles, validation, and the Formspree submissions for both the contact form and the
  footer signup.
- `site/assets/site.css` — the handful of rules the design system doesn't cover (`.form__error`,
  `.form__success`, link-styling resets for elements that used to be `<button>`s, and the
  language toggle).
- `site/assets/strings.js` — the EN/ES lookup table for text `site.js` builds at runtime. It must
  load **before** `site.js` on every page.

### The tradeoff

Nav and footer markup is duplicated across all sixteen files, and again across their Spanish
counterparts, so thirty-two in total. That is deliberate. A parish site that changes a few times a
year is better served by files a volunteer can open and edit than by a build step, and a build
step is exactly what this repo just removed. When chrome changes, change it everywhere and run
`node scripts/verify-i18n.mjs`, which fails if the two trees drift apart.

### Regenerating (historical)

`scripts/migrate-buttons-to-anchors.py` and `scripts/prerender.mjs` produced the flatten from the
pre-flatten template. They are kept for the record, not for routine use, and running them now
would overwrite hand-edits. Recovering the old template means checking out a commit before the
flatten.

## Bilingual: `site/es/`

The site is English and Spanish. Spanish lives in a parallel `site/es/` tree that mirrors the
English one file for file, using the **same English slugs** (`/es/mass/`, not `/es/misa/`), so the
language toggle is a pure path rewrite with no lookup table to maintain.

- Every page carries a self-referencing `canonical` plus an `hreflang` triple (`en`, `es`,
  `x-default`), and a toggle anchor (`.utility-bar__lang`) in the utility bar. `site.js` clones
  that anchor into the mobile drawer.
- Relative nav links (`../mass/`) keep you inside whichever tree you are already in, so language
  persists structurally. There is no `localStorage`, no cookie, and no auto-redirect on
  `navigator.language`.
- **Submission labels are always English.** Anything sent to Formspree or the worker (reason,
  parish, sacrament, subject, newsletter preferences) stays English so the office can read it.
  That is enforced by fixed `value` attributes and by `data-en` on the newsletter chips. Do not
  translate either. `chipValue()` falls back to the visible label text when `data-en` is missing,
  which on a Spanish page would quietly mail Spanish labels to the office, so every chip in both
  trees carries `data-en` even where English does not strictly need it.
- A page still awaiting Spanish copy carries `<meta name="robots" content="noindex">` and a
  `TRANSLATION PENDING` comment, so search never indexes English copy at a Spanish URL. The rule
  runs one way: pending implies noindex, but noindex does not imply pending. An unlaunched page
  is noindex in both languages regardless of translation state, which is why
  `site/es/forms/parish-registration/` stays hidden while `FORMS_LIVE = False`.
- `TRANSLATION.md` is the handoff spec: scope, glossary, register, and the rules above.

Run `node scripts/verify-i18n.mjs` after touching either tree. It needs nothing installed and
checks page pairing, toggle targets, hreflang, asset paths, chrome parity, and EN/ES key parity in
`strings.js`.

It also compares the `name`, `value`, `id`, `for`, `data-en`, and `data-ukc-form` attributes on
each page against its counterpart and fails on any difference. Those attributes are what `site.js`
and the forms engine key off, and a translator editing prose has no reason to touch them, so a
mismatch means something load-bearing got translated by accident.

`scripts/verify-pages.mjs` and `scripts/verify-behavior.mjs` are still worth running after edits
to the chrome or to `site/assets/site.js`. Both need Playwright, which is deliberately not
installed in this repo; copy them to a scratch directory that has it:

```sh
mkdir -p /tmp/ukc-verify && cd /tmp/ukc-verify && npm i playwright
cp ~/projects/personal/ukc-website/scripts/verify-*.mjs .
node verify-pages.mjs && node verify-behavior.mjs
```

`verify-pages.mjs` loads every page and reports console errors, 404s, and leftover runtime markup,
writing full-page screenshots to `/tmp/ukc-shots`. Look at them. `verify-behavior.mjs` exercises
the drawer, the conditional fields, and validation.

## New work is plain static files

Anything added from here on (for example `site/forms/`) should be ordinary HTML, CSS, and
vanilla JS. No build step, no `package.json`, no `node_modules` in this repo.

## Fonts

`python3 scripts/optimize-site-fonts.py` converts TTF to woff2 and rewrites `@font-face`. It only
needs re-running if new font files are added (needs `fonttools` + `brotli`).

## Deploy

GitHub Pages serves `site/` via `.github/workflows/deploy-pages.yml` on every push to `main`.
Live: https://dpeterson01.github.io/ukc-website/

## Verify a deploy

`gh run list --limit 1` for status, then curl the live URL and a `.woff2` font (expect 200) plus
an old `.ttf` (expect 404) to confirm the optimized fonts shipped.

## Local preview

```sh
cd site && python3 -m http.server 8000
```
