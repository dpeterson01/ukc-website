# render/ — weekly issue → bulletin PDFs + email HTML

Turns a week's `issues/<date>.json` into the on-brand outputs using the design-system
templates. The `.html` templates in `design-system/ui_kits/` are the single source of
truth; this renderer injects content into their CSS selectors / `data-slot` hooks with
cheerio (no template duplication), then prints the bulletin to PDF with
Playwright/Chromium and imposes the 11×17 booklet with pdf-lib.

## Setup (one time)

```sh
cd render
npm install          # installs cheerio + playwright + pdf-lib, then downloads Chromium
```

## Render a week

```sh
cd render
node render.js 2026-06-14        # full: HTML + both PDFs + email
node render.js                   # uses the latest issues/*.json
node render.js 2026-06-14 --no-pdf   # HTML only (no Chromium needed)
```

Outputs land in `issues/<date>/`:

| File | What |
| --- | --- |
| `bulletin.rendered.html` | Production HTML (dev panel + scripts stripped, `<base>` added so fonts/logos resolve) |
| `bulletin.pdf` | Print-ready 8.5×11 ×4 |
| `bulletin-11x17.pdf` | Imposed duplex booklet (front 4\|1, back 2\|3) for the church printer + mechanical folder — **print duplex, flip on short edge** |
| `email.html` | Email-safe newsletter (full field mapping: preheader, dateline, quote, reflection, Three Things from announcements, FORMED pick, CTA; liturgical accent hex trio swapped per season) |
| `email.meta.json` | Subject + preheader for the Brevo adapter (`deliver-brevo.js`) |

## Skeleton a new week

```sh
node pull.js 2026-07-19          # → issues/2026-07-19.json (pre-filled skeleton)
```

`pull.js` fetches the Sunday's readings + liturgical day title from USCCB
(date-deterministic URL), computes the season, pulls saint-of-the-day candidates from
RSS, and merges announcements active for that Sunday from `announcements/backlog.json`.
AI-drafted fields (reflection, FORMED pick, subjects) are left as `TODO` markers for the
agent's drafting pass.

## How it maps

`render.js` reads `issue.json` and sets:
- the liturgical season class on `<html>` (bulletin) and the inline accent-hex trio (email),
- `data-active-variant` / `data-layout` on hero, feature, kids-corner, encounter-pair, house-card,
- text + repeatable lists (readings, intentions, calendar, announcements, stewardship),
- email `data-slot` hooks (preheader, dateline, quote, reflection, things, formed-copy, cta).

Add a new field by mapping its `issue.json` path to a selector in `renderBulletin()` /
`renderEmail()`.

## Known follow-ups
- **Quarterly newsletter** is not yet wired into the renderer (quarterly, lower-frequency
  artifact); add a `renderNewsletter()` when needed.
- **Booklet imposition assumes exactly 4 pages** — it warns and skips otherwise.
