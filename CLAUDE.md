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

## The `<x-dc>` runtime is load-bearing — don't delete it

`site/index.html` looks like a static file but is a **React single-page app**. Verified in a
browser 2026-07-29:

- The whole page body sits inside one `<x-dc>` template that `support.js` hydrates into React.
  After load there are zero `<x-dc>` elements left in the DOM.
- `support.js` pulls React 18.3.1 and ReactDOM from `unpkg.com` at runtime.
- All fourteen pages (`home`, `new`, `mass`, `about`, `sjb`, `ic`, `sjb-history`, `ic-history`,
  `sacraments`, `formation`, `giving`, `watch`, `contact`, `prayer`) live in that one file behind
  a hash router, with `<title>` and meta description swapped per route.

So `site/support.js` and `site/_ds/*/_ds_bundle.js` render the entire site. Removing them blanks
it. Page content and layout are edited inside the `<x-dc>` template; behavior is edited in the
`<script type="text/x-dc" data-dc-script>` component class near the bottom of the file.

Two known consequences, both worth fixing in their own change rather than piecemeal:

1. Every page view depends on `unpkg.com` being reachable.
2. Hash routes mean search engines index one URL, so thirteen pages are invisible.

The fix is to flatten the hydrated DOM into real static pages at real URLs, reimplement the small
amount of interactivity in plain JS, and then drop the runtime. Not started.

## New work is plain static files

Anything added from here on (for example `site/forms/`) should be ordinary HTML, CSS, and
vanilla JS that does not touch the Claude Design runtime. That keeps new work unaffected by the
flattening project above.

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
