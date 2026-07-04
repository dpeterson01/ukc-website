# Upper Kittitas Parishes — Design System

The shared brand identity of two Catholic parishes in the Cascade foothills of Washington State:

- **St. John the Baptist** · Cle Elum
- **Immaculate Conception** · Roslyn

The two parishes share one pastor, one mission, and one visual identity. The brand expresses *"Two places. One faith. One future in Christ."*

> Use this system when designing anything that wears the parish name: bulletins, websites, signage, social posts, slide decks, certificates, mailings, livestream lower-thirds. Anyone — staff, volunteers, or vendors — should be able to look here and produce on-brand work.

---

## Sources

This design system was built from these materials. Filed here so the system can be regenerated or expanded later.

| Source | Where it lives | Notes |
| --- | --- | --- |
| `brand/` repo | Local mount, attached as a read-only directory (paths begin `brand/`) | Master asset folder. SVG / PNG / AI / PDF logo files, brand swatches (.ase), source Illustrator masters, and the brand-kit markdown. |
| Logo SVG masters | `brand/logos/` (the variants in active use are kept in the consuming project's `assets/logos/`) | Primary lockup, stacked lockup, three shields (combined / SJB / IC), three standalone icons (lamb / Marian M / circle), plus the cross element. Each comes in fullcolor / mono-navy / mono-white / reverse variants. |
| Brand kit | `brand/BRAND-KIT.md` | The short, plain-language brand guide for volunteers — colors, fonts, logo choices, do's and don'ts. |
| Asset audit | `brand/ASSET-AUDIT.md` | What's produced, what's missing (e.g. cascade ridgeline graphic, sized favicon exports). |
| Illustrator builder | `brand/templates-source/build-brand-guidelines.jsx` | ExtendScript that builds the 15-page printed brand guide. Treated here as the canonical color + typography spec because it pins exact RGB values and font usage rules. |
| Reference PDFs | `uploads/Parish Brand Guidelines.pdf`, `uploads/parish-brand-assets.pdf` | Print-ready brand book and asset sheet. |
| Font files | `uploads/CormorantSC-*.ttf`, `uploads/SourceSans3-*.ttf`, `fonts/SourceSerif4-*.ttf` | All three families self-hosted in `fonts/` as static weights. Source Serif 4 statics were added from the `brand/` mount, so no family depends on a CDN. |

---

## What's in this folder

```
.
├── README.md                  ← this file
├── colors_and_type.css        ← color + type + spacing tokens, semantic styles
├── _ds_bundle.js              ← bundled component runtime loaded by every design
├── _ds_manifest.json          ← design-system manifest
├── fonts/                     ← Cormorant SC, Source Sans 3, Source Serif 4 (.ttf, self-hosted)
├── preview/
│   └── _card.css              ← shared styles for design-system specimen cards
└── ui_kits/
    ├── parish_website/        ← high-fidelity recreation of the parish website (styles.css)
    ├── parish_bulletin/       ← weekly bulletin layout (bulletin.css)
    └── parish_newsletter/     ← quarterly newsletter layout (newsletter.css)
```

> **Brand masters live in a separate repository.** The original AI / PDF source files, brand
> swatches (.ase), large raster exports, the printed brand guide, and the brand-kit / asset-audit
> markdown are kept in the parallel `brand/` repo, not in this folder. The approved SVG logo
> variants used by the products in this project are kept alongside the products that consume them
> (see the project's own `assets/logos/`), not under this design-system folder. Pull from the
> `brand/` repo when you need print masters or PNGs at specific pixel sizes.

---

## Content fundamentals

The parish voice is **warm, invitational, and rooted** — never corporate, never programmatic. We are writing to a real congregation: lifelong Catholics, returning Catholics, and curious visitors. Many are over 60. The tone of a hand-written note in the bulletin is closer to the target than the tone of a marketing email.

### Voice traits

- **Warm, not formal.** "Welcome home." Not "We invite you to join our community."
- **Rooted in place.** Mention Cle Elum, Roslyn, the Cascades, the mountains, the valley. We are a parish *of* somewhere.
- **First person plural.** "We gather." "Our parishes." Rarely "I". Almost never "you" in a hectoring way — "you" is fine when extending hospitality ("you'll find coffee in the hall").
- **Catholic, unapologetically.** "Mass," "the Sacraments," "the Blessed Mother," "the Eucharist." Don't translate Catholic vocabulary into generic spiritual language.
- **Sentence-case for everything but proper nouns and the parish name.** Don't Title-Case Every Word.
- **No corporate verbs.** Avoid *leverage, engage, optimize, drive, deliver*. Prefer *welcome, gather, celebrate, accompany, pray, offer, host.*

### Casing rules

| What | Casing | Example |
| --- | --- | --- |
| Parish names in lockups | small caps via Cormorant SC | `St. John the Baptist`, `Immaculate Conception` |
| Section headers in print | sentence case | "This week at the parishes" |
| Eyebrow labels | UPPER w/ wide tracking | `THIS WEEK · DEC 8` |
| Body | sentence case | "Mass is at 8:30 a.m." |
| Time of day | lowercase with periods | "8:30 a.m." not "8:30 AM" |
| Sacraments | capitalized | "Reconciliation," "Confirmation" |
| Mass | always capitalized | "daily Mass" |

### Voice examples — write like this

> **Welcome home.** Whether you've been with us for decades or you're just visiting Cle Elum for the weekend, you have a seat at the table.

> **This Sunday.** We gather at 8:30 in Cle Elum and 10:30 in Roslyn. Coffee and donuts follow the 10:30 Mass — come say hello.

> **Adoration returns Thursday.** The Blessed Sacrament will be exposed from 6 to 7 p.m. in the chapel. All are welcome to come and sit, even for just a few minutes.

### Voice examples — *don't* write like this

> ~~"Engage with our vibrant faith community! Click here to learn more about our exciting offerings."~~ (marketing voice)
> ~~"You should attend our Mass."~~ (commanding)
> ~~"Our state-of-the-art parish leverages tradition to deliver impact."~~ (corporate)
> ~~"✨ Join us for Mass! 🙏"~~ (emoji and exclamation slop)

### Punctuation, dashes, emoji

- Em-dashes are welcome — they fit the contemplative pacing.
- Oxford comma always.
- One exclamation point per page, maximum. The voice carries warmth without shouting.
- **Emoji are not part of the brand.** Use the lamb mark, the Marian M, the cross, or nothing at all.
- Liturgical glyphs (✠, ☧, ☩) are permitted in printed contexts (memorial cards, sympathy notes); not in digital UI.

---

## Visual foundations

### Identity in one sentence

A **navy / gold / warm-white palette** with a **serif-forward type system** and a **modular bookend logo** (Lamb + Cross + Marian Monogram, read left-to-right as the Paschal Mystery).

### Color

- **Foundation:** navy (`#2E5E8A`) and gold (`#C4A24C` screen / `#B8945F` print) on warm white (`#FAF8F5`). Body text is charcoal (`#333333`), never pure black — the warm-white background calls for a warmer black.
- **Parish accents:** SJB Green (`#2E7D32`) appears *only* in the SJB standalone lamb and SJB-only materials. Marian Blue (`#2A5298`) appears *only* in the IC standalone M and IC-only materials. When the two parishes act together, both icons shift to shared navy.
- **Liturgical accents** (green / violet / gold / red) decorate seasonal materials but never replace navy + gold as the foundation.
- The palette is **earthy and warm**, not bright or saturated. Avoid neons, electric blues, candy reds.

### Typography

- **Display:** Cormorant SC — small caps with `+0.06em` tracking. Used *only* for parish names and formal display. Never set running paragraphs in it.
- **Serif:** Source Serif 4 — headlines (Semibold 600), body (Regular 400), italic for taglines and quotes.
- **Sans:** Source Sans 3 — labels, captions, UI metadata, and forms.
- **Body minimum:** 16px screen, 11pt print. Our congregation skews older.
- **Hierarchy moves through size + weight + family**, not color. Color stays restricted to navy / charcoal / gold accents.

### Backgrounds

- Default page background is **warm white**. Pure `#FFFFFF` is reserved for cards and surfaces that need to feel pristine — paper-on-paper.
- The hero treatment is **solid navy** with a centered logo or shield. No gradients, no overlays, no AI-flavored radial glows.
- Where a photo is used, it's a **real parish photo** — interior of the church, landscape of the valley, congregation gathered. Imagery skews warm, golden hour, slightly desaturated. Never cool, never b&w high-contrast, never grain/film simulation overlays.
- **The Cascade ridgeline** (not yet produced — see brand audit) is the only allowed decorative graphic: a stylized two-layer mountain silhouette in navy / navy-mid / navy-dark. It functions as a footer or section divider, never as the focal point.
- **No repeating patterns or textures.** No paper texture, no parchment, no stipple. The brand is clean and modern-traditional.

### Borders, dividers, rules

- The signature divider is a **2px gold rule** under section headers.
- A diamond-flanked rule (`◆`) is acceptable for ceremonial or bulletin contexts.
- Hairline borders on cards: `#E5DFD3` (warm) at 1px. Never gray.

### Shadows

- **Used sparingly.** The brand reads flat and traditional, not material-design.
- When elevation is needed, use a low-spread tinted shadow (`rgba(26, 58, 82, 0.06–0.10)`), never a black shadow.
- No glows. No colored glows. No drop shadows on text.

### Corner radii

- **No rounded corners by default.** Cards, buttons, surfaces, hero blocks all use sharp `0px` corners — this is core to the traditional / liturgical feel.
- Inputs get `2px` only to avoid feeling brutal.
- Avatars and the circle logo are full circles (`50%`).
- **Never** apply 12–24px "modern card" rounding — this is an anti-pattern for the brand.

### Buttons, hover, press

- Primary action: solid navy fill, warm-white text. Hover darkens to `#1F4769`. Press shifts to `#16344D` with no scale change.
- Secondary: warm-white fill, navy border + text. Hover: warm cream fill (`#F4EFE6`).
- Tertiary / link button: navy text, gold 1px underline on hover.
- Focus ring: 2px gold (`#C4A24C`), 2px offset. Always visible for keyboard users.
- **No animated bounce, no scale-up hovers, no shimmer.** Subtle color shifts only.

### Animation

- **Quiet, almost imperceptible.** 120–320ms standard cubic easing.
- Acceptable: opacity fades, color transitions on hover, expand/collapse for accordions.
- **Not acceptable:** spring bounces, parallax scrolling, scroll-triggered reveals, looping background ambient motion.
- The brand prizes reverence. Motion that draws attention to itself is off-brand.

### Layout & spacing

- 4px-base spacing scale (4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 / 96).
- Generous vertical rhythm. Don't crowd. The bulletin metaphor is white margins, not edge-to-edge cards.
- Page max width for reading: ~720px for prose, ~1200px for marketing sections.
- Symmetry over asymmetry. The logo is bilaterally symmetric (Lamb · Cross · M); layouts that center-align section headers feel native. Off-center hero compositions feel imported from another brand.

### Transparency, blur

- **Both used very rarely.** No frosted-glass headers, no backdrop-blur navigation.
- The one acceptable transparency: a 20–30% navy scrim over a photograph when the logo or text must sit on it.

### Imagery vibe

- Warm color temperature, soft natural light, slight desaturation.
- Subjects: the church interiors, the altar, the congregation gathered, the Cascade landscape, the valley in golden hour.
- Avoid: stock-photo smiling families, glossy product-style imagery, anything that looks AI-generated.

---

## Iconography

The brand has its own iconographic vocabulary that comes first; UI icons are secondary and substituted from a curated open source.

### Brand iconography (the marks)

The brand *is* its iconography. Five core symbols, all available as SVG masters in `assets/logos/`:

| Symbol | File pattern | Meaning |
| --- | --- | --- |
| **Primary lockup** | `parish-fullcolor_primary-lockup.svg` | Lamb · Cross · Marian M with both parish names. Default mark. |
| **Stacked lockup** | `parish-fullcolor_stacked-lockup.svg` | Same composition stacked for square/portrait spaces. |
| **Circle icon** | `parish-fullcolor_circle-icon.svg` | All three symbols inside a navy circle. Social avatars, favicons. |
| **SJB standalone (lamb)** | `parish-fullcolor_sjb-standalone.svg` | In SJB Green. SJB-only use. |
| **IC standalone (Marian M)** | `parish-fullcolor_ic-standalone.svg` | In Marian Blue. IC-only use. |
| **Combined shield** | `parish-fullcolor_combined-shield.svg` | Heraldic shield with all three symbols. Formal/ceremonial. |
| **Individual shields** | `parish-fullcolor_{sjb,ic}-shield.svg` | Heater shields for SJB and IC respectively. |
| **Cross element** | `parish-fullcolor_cross.svg`, `parish-gold-{screen,print}-cross.svg` | The cross from the lockup, available standalone in screen-gold and print-gold. |

Each variant ships in **fullcolor / mono-navy / mono-white / reverse** (full color on navy background). When in doubt: primary lockup on warm white.

### UI iconography

The brand does not specify a UI icon system. **Substitution flagged for the user:** we use **[Lucide](https://lucide.dev)** (CC-licensed line icons) at `1.5px stroke` — chosen because Lucide's monoline geometry sits quietly next to the serif type without competing with the heraldic marks. Loaded from the CDN in UI kits:

```html
<script src="https://unpkg.com/lucide@latest"></script>
```

Rules:

- Stroke `1.5px` (default Lucide weight).
- Default color is `currentColor` (matches surrounding text).
- Size in increments of 4px: 16, 20, 24, 32.
- Pair sparingly. The brand voice is contemplative; a screen with 30 icons looks frantic.

> **FLAG:** Lucide is a substitution. If the parish prefers a different system (Phosphor, Heroicons, or commissioned custom icons), swap globally in `colors_and_type.css` and the UI kits.

### Emoji and Unicode glyphs

- **Emoji: never** in branded materials. They flatten the voice into Mailchimp tone.
- **Liturgical Unicode glyphs are welcome** in print: ✠ (Latin cross), ☩ (cross of Jerusalem), ◆ (gold diamond divider), † (dagger / used as "rest in peace" mark).
- The gold diamond (`◆`) in `--color-gold-screen` is the canonical separator inside running prose — e.g. between parish names on a single line.

### Pictograms

If we need a "ministry icon" set (Liturgy, Music, Faith Formation, Outreach, Stewardship), commission them as a custom mini-set in the same monoline weight as Lucide so they live in the same visual family. Don't mix illustration styles.

---

## Quick reference — getting started

1. Drop `colors_and_type.css` in the document `<head>`.
2. Use `var(--color-navy)`, `var(--font-serif)`, etc — never raw hex / font names.
3. Pull a logo from the project's `assets/logos/` rather than embedding inline SVG.
4. For UI components, copy from `ui_kits/parish_website/`.
5. To brief an agent (Claude or otherwise) on this brand, point it at this `README.md`.

## Index — what each file is for

| File / folder | What's in it |
| --- | --- |
| `README.md` | This file — brand context, voice, visual rules, iconography, caveats. |
| `colors_and_type.css` | All design tokens (color, type, spacing, radii, shadow, motion) + base semantic styles. The source of truth — never re-define hex codes elsewhere. |
| `_ds_bundle.js` | Bundled component runtime that each design loads to compose with design-system components. |
| `_ds_manifest.json` | Design-system manifest. |
| `fonts/` | Cormorant SC (5 weights), Source Sans 3 (16 weight/italic combos), and Source Serif 4 (16 weight/italic combos) — all self-hosted as static TTF. |
| `preview/_card.css` | Shared card styles for design-system specimen cards. Imports `colors_and_type.css`. |
| `ui_kits/parish_website/styles.css` | Styles for the high-fidelity recreation of the parish marketing website. |
| `ui_kits/parish_bulletin/bulletin.css` | Styles for the weekly parish bulletin layout. |
| `ui_kits/parish_newsletter/newsletter.css` | Styles for the quarterly parish newsletter layout. |

The approved SVG logo variants (primary lockup, circle icon, SJB lamb, IC Marian M, combined shield, mono / reverse variants) are stored with the products that consume them — see the project's own `assets/logos/` — and the print masters live in the separate `brand/` repository.

## Caveats and open items

- **Official lockup SVGs in `assets/logos/` predate the May 2026 committee proportions** (Lamb 56%, Cross 103%, full Marian Monogram 100%, all bottom-aligned). The hand-composed preview cards for the Primary, Stacked, Reverse, Standalone, and Paschal lockups follow the new spec; the SVG files themselves still need to be re-exported from `brand/templates-source/parish-brand-assets.ai` to match. Anywhere a lockup SVG is embedded directly — the parish website nav/footer, the mono-variants / circle-icon / shields preview cards, and any future use of these files — will reflect the older proportions until the SVGs are regenerated.
- **Lucide is a substitution** for UI iconography; the brand book doesn't specify a system.
- **Real parish photography is not in this repo.** Hero areas use solid navy with the lockup until photos are supplied. The pastor card on the About page shows a placeholder "F" tile in place of Fr. Francisco's photo.
- **No email or newsletter templates have been built yet.** The website is the only product surface currently in the kit. Newsletter design is the next item up.

