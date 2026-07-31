# Translating the site into Spanish

Phase 1 built the plumbing: a complete `site/es/` tree with all sixteen pages, a language
toggle in the utility bar of every page, and a `strings.js` table for the text that
JavaScript builds at runtime.

**Phase 2 is done as a first pass.** All sixteen pages and all 43 runtime strings are in
Spanish, and the `noindex` tags and `TRANSLATION PENDING` markers have come off. The one
exception is `site/es/forms/parish-registration/`, which stays `noindex` because the
English form is not launched yet.

What remains is review. The pass below was produced against the glossary and register
rules in this document, so it is consistent, but it has not been read by a native speaker
who knows the parish. Fr. Higuera should review it in the browser rather than in a diff:
the copy reads differently in place than it does as a list of strings. The rest of this
document is the spec that pass was written to, and the reference for anyone editing the
Spanish later.

## How much there is

| Thing | Volume |
| --- | --- |
| 16 pages under `site/es/**/index.html` | 7,121 words |
| Registration form schema (`site/forms/schemas/parish-registration.json`) | 59 strings, 280 words |
| Runtime UI strings (`ES` block in `site/assets/strings.js`) | 43 keys |
| Total | roughly 45,000 characters |

## The translation model, and why

At 45,000 characters the money question mostly answers itself. Here is what the options
actually cost:

| Approach | One-time cost | Cost per future update |
| --- | --- | --- |
| Professional agency, human translator | $850 to $1,800 | $0.12 to $0.25 per word |
| Machine translation API (DeepL, Google) | under $2 | under $2 |
| LLM with a glossary and tone instructions | pennies | pennies |
| Bilingual parishioner volunteer | free | depends on their availability |

Cost is not the constraint here. Quality control and maintenance are. An agency
translation is a snapshot that goes stale the first time Mass times change, and every
subsequent edit is billable. Raw machine translation is cheap but you cannot tell it
that "Reconciliation" is a sacrament rather than a peace process, and it has no way to
know the parish's voice.

**Recommendation: an LLM first pass against an approved glossary, reviewed line by line
by Fr. Higuera.** He is fluent, he is the one who will answer the Spanish contact and
registration submissions anyway, and he is the only reviewer who can judge whether the
Spanish sounds like this parish rather than like a generic diocesan website. That makes
the expensive part of the job (authoritative review) free, and the cheap part of the job
(the first draft) close to free.

Two things make this work rather than turning into a mess:

1. **Approve the glossary before translating anything.** Terminology fixes applied after
   sixteen pages are drafted mean re-reading sixteen pages. Get Fr. Higuera to sign off
   on the table below first, in one sitting, then translate.
2. **Review in the browser, not in a diff.** Serve the site locally and click through
   `/es/`. Reviewing HTML source is slow and it hides layout problems.

A bilingual parishioner is still worth recruiting, not for the first draft but as a
second reader for tone. Someone from the community will catch phrasing that is correct
but stiff.

## Register and terminology

**Use `usted`, not `tú`.** The English copy is warm but not familiar, and the site
speaks to people who have not met us yet. `Usted` matches that. No `vosotros` anywhere.

**Neutral Latin American Spanish**, not Peninsular. The Spanish-speaking community here
is predominantly of Mexican heritage, so where a regional split exists, prefer the
Mexican usage.

**Follow USCCB Spanish for anything liturgical or catechetical.** The bishops' conference
publishes the Spanish the American Church actually uses, and matching it means our
wording lines up with what people hear at Mass and read in diocesan materials.

Starter glossary. Fr. Higuera should confirm or correct this before drafting begins:

| English | Spanish |
| --- | --- |
| Mass | Misa |
| Vigil Mass | Misa vespertina |
| Holy Day of Obligation | Día de precepto |
| Confession, Reconciliation | Confesión, Reconciliación |
| Sacrament | Sacramento |
| Baptism | Bautismo |
| First Communion | Primera Comunión |
| Confirmation | Confirmación |
| Marriage | Matrimonio |
| Funeral | Misa exequial |
| Anointing of the Sick | Unción de los enfermos |
| Adoration | Adoración |
| Holy Hour | Hora Santa |
| Rosary | Rosario |
| Parish | Parroquia |
| Parishioner | Feligrés, feligresa |
| Pastor | Párroco |
| Deacon | Diácono |
| Diocese | Diócesis |
| Faith Formation | Formación en la fe |
| RCIA / OCIA | RICA (Rito de Iniciación Cristiana de Adultos) |
| Bulletin | Boletín |
| Newsletter | Boletín informativo |
| Prayer request | Petición de oración |
| Giving, offering | Ofrenda, donativos |
| Livestream | Transmisión en vivo |
| Register as a parishioner | Inscribirse como feligrés |

**Parish names.** Fr. Higuera's call. Spanish-speaking Catholics will say *San Juan
Bautista* and *Inmaculada Concepción*, but the English names are what appear on the
buildings and on diocesan paperwork. The suggestion is to use the Spanish name in body
copy with the English in parentheses on first use per page, and to leave the logo, the
addresses, and the map links untouched. Place names stay in English: Cle Elum, Roslyn,
Kittitas County, Cascade foothills.

**Nav labels are short on purpose.** The seven inline links have to fit beside the parish
lockup, so the nav says *Misas* and *Formación* where the page headings say *Horario de
Misas* and *Formación en la Fe*. That is not an inconsistency to correct. One link carries
both lengths and the stylesheet picks between them by screen width:

```html
<a class="nav__link"><span class="nav__label-long">Nuestras Parroquias</span><span
   class="nav__label-short">Parroquias</span></a>
```

Translate the text inside each span and leave the spans, their classes, and the absence of
whitespace between them alone. Deleting either one breaks the narrow layout.

**Do not translate the abuse reporting notice in the footer.** The Diocese of Yakima
publishes official Spanish wording for the Victim Assistance line. Get that exact text
from the diocese and paste it in. Improvising here is the one place where a well-meaning
translation could cause real harm.

## The Mass language note (required content change)

There is no Spanish-language Mass at either parish right now. The Spanish pages have to
say so plainly, so that nobody drives to Cle Elum on a Sunday expecting one.

Frame it honestly and warmly. All Masses are currently celebrated in English. Fr. Higuera
speaks Spanish, there are many Spanish-speaking families in the pews, and anyone who
wants to talk with him in Spanish can. Say that too. The point is to set an accurate
expectation without making anyone feel like a guest.

Add this note to:

- `site/es/mass/index.html` (prominently, near the top of the schedule)
- `site/es/index.html` (with the weekend Mass times)
- `site/es/sjb/index.html`
- `site/es/ic/index.html`
- `site/es/new/index.html`

Draft Fr. Higuera can edit:

> Todas nuestras Misas se celebran actualmente en inglés. Muchas familias
> hispanohablantes forman parte de nuestra comunidad, y el Padre Higuera habla
> español, así que no dude en acercarse a él antes o después de la Misa.

## Rules that must not be broken

The Spanish pages are hand-edited HTML, same as the English ones. Nothing regenerates
them, so a mistake here stays until someone notices it.

**Translate visible text only.** Everything a visitor reads: headings, paragraphs, list
items, button labels, link text, `alt` text, `<title>`, and the meta description.

**Never change these:**

- `href`, `src`, `id`, `class`, `name` attributes
- `value` attributes on `<option>` and `<input>` elements
- `data-en` attributes on the newsletter chips
- `data-ukc-form`, `data-base`, and `data-endpoint` on the registration page
- The `hreflang`, `canonical`, and `alternate` link tags
- `<html lang="es">`

The `value` and `data-en` rules exist for a specific reason. Form submissions arrive at
the parish office labelled in English no matter which language the visitor used, so
whoever reads the email does not have to translate it back. Changing a `value` breaks
that.

**In `site/assets/strings.js`, only edit the `ES` block.** Leave the `EN` block alone.
Do not rename, reorder, or remove keys. A value left as `''` falls back to English, so
partial translation is safe: fill in what you are sure of and leave the rest empty.

**Watch the length.** Spanish typically runs 20 to 25 percent longer than English. Nav
items, buttons, and the utility bar are the tight spots. If a nav item wraps to two
lines, shorten the Spanish rather than touching the CSS.

## Per-page workflow

1. Open the English page and its Spanish counterpart side by side. They are structurally
   identical right now.
2. Translate the visible text in place in the Spanish file.
3. Translate `<title>` and `<meta name="description">`.
4. Delete the `<meta name="robots" content="noindex">` tag **and** the
   `<!-- TRANSLATION PENDING -->` comment. Both, together. The verify script fails if one
   is removed without the other.
5. Serve the site and look at the page. Not the diff, the page.

```sh
cd site && python3 -m http.server 8765
```

Then open `http://localhost:8765/es/` and click through.

## Verify before committing

```sh
node scripts/verify-i18n.mjs
```

This checks that every English page has a Spanish counterpart, that the toggle on each
page resolves to a real file, that the hreflang and canonical tags are correct, that
asset paths exist on disk, that the `noindex` tag and the pending comment were removed
together, that the nav and footer match within each tree, and that `EN` and `ES` have the
same keys in `strings.js`. It also reports how many pages are still waiting on Spanish
copy.

It needs nothing installed. `scripts/verify-pages.mjs` and `scripts/verify-behavior.mjs`
are still worth running for anything that touches the chrome, but those need Playwright
in a scratch directory (see `CLAUDE.md`).

## Not in this phase

- A Spanish schema for the registration form. Phase 4. Right now the Spanish registration
  page loads the English schema, which is deliberate and works.
- Removing `noindex`. It stays on every Spanish page until the copy on that page is
  translated, so search engines never index English content sitting at a Spanish URL.
- Automatic language detection or redirects. The toggle is the only way to switch, on
  purpose.
