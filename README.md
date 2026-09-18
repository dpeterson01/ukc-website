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

A self-contained static site, **hand-edited directly**. Each page is its own `index.html` at its
own URL (`site/index.html`, `site/mass/index.html`, `site/contact/index.html`, and so on, fourteen
in all). Pages load the design-system CSS and fonts from `_ds/`, brand logos from `assets/logos/`,
and a small amount of hand-written behavior from `assets/site.js` and `assets/site.css`. The
`.nojekyll` file tells GitHub Pages to serve the files as-is.

There is no build step and no runtime dependency. `index.html` was a React single-page app behind
a hash router until 2026-07-29; it was flattened so that every page is real HTML at a real,
indexable URL. One consequence worth knowing before editing: nav and footer markup is duplicated
across the fourteen files, so chrome changes have to be made in each. See `CLAUDE.md`.

New additions (such as `site/forms/`) are written as ordinary HTML, CSS, and vanilla JS.

### Bulletin archive

Approved reader PDFs live at `site/bulletins/<year>/<date>-bulletin.pdf`. The direct-access
archive at `/bulletins/` reads `site/bulletins/index.json`; `/es/bulletins/` provides the paired
Spanish view. Both pages are linked from the four-item Connect footer, are indexable, and
appear in the sitemap. Home and livestream pages link to the latest PDF and the recent archive.
Bulletins do not add an item to the header or mobile drawer. Prayer requests remain available
through the Contact page; the standalone prayer page is unchanged.

Both archive pages show the four newest distinct published issue dates. The homepage and
livestream page in each language show only the single newest issue. All six views read the
same manifest through `assets/bulletin-archive.js`; no scheduled cleanup is needed. An upcoming
Sunday's issue appears as soon as it is published. Older PDFs and manifest entries are retained.
Spanish links identify the full PDF as English; only the email edition is planned for translation.

The five legacy issues dated August 16, 23, 30 and September 6, 13, 2026 were imported unchanged
from the supplied PDFs. File sizes and SHA-256 values were checked against the originals.
The already-published September 20 issue remains in the archive; importing historical issues
does not unpublish it. Only four newest cards are displayed, not every stored PDF.

`scripts/publish-bulletin.mjs` is the only supported archive writer. It validates the PDF,
copies it to the dated public path, and updates the manifest idempotently. The private
`ukc-bulletin` repository calls it only after bulletin approval.

### Signup language deployment gate

Footer signup sends `Preferred language` as `en` or `es` from the page language. The API defaults
missing values to English and rejects unsupported values. New double-opt-in invitations write
the Brevo category attribute `PREFERRED_LANGUAGE`, with `1` for English and `2` for Spanish.
Existing contacts are read first and left unchanged, including their consent and suppression
state. Existing subscribers change language through their personalized Brevo preference link;
public signup is not a profile-update or resubscription endpoint.

Before deploying this API change, provision or verify that exact attribute mapping and grant
the integration contact-read access. Configure `BREVO_DOI_TEMPLATE_ID_ES` for the Spanish
confirmation template. `BREVO_DOI_REDIRECT_URL_ES` defaults to `https://ukccatholic.org/es/`;
the existing English template and redirect settings remain supported. Confirm DOI persistence,
repeat-signup behavior and preference-form changes with authorized pilot contacts first.
Account configuration is not provisioned by this code. On 2026-09-18, the separately authorized
Brevo setup created and verified the category and Spanish DOI template **6**. Configure
`BREVO_DOI_TEMPLATE_ID_ES=6` at API deployment. The hosted preference form was saved and
reopened with `LANGUAGE / IDIOMA` below Parish News. The live consent/persistence pilot
remains pending; the saved form and local tests do not prove recipient behavior.

If lookup or invitation fails, or Spanish confirmation is unconfigured, the office fallback
retains the language. It must still be processed with proof of consent; it is not permission
to add a contact directly to a sending audience. The browser returns a generic acknowledgement
for invitations, existing contacts and office fallback without revealing membership.

Deploy the configured API before the website language payload. Do not deploy the API until
the Brevo attribute and templates are ready. Local tests use stubbed requests and send no mail.

Checks: `node scripts/test-publish-bulletin.mjs`, `node scripts/verify-i18n.mjs`, the existing
Playwright `verify-behavior.mjs` runner, and `npm test` from `api/`.

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
