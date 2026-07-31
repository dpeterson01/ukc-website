#!/usr/bin/env python3
"""Generate a form page by borrowing the chrome from an existing site page.

The site has no build step, so every page carries its own copy of the header,
nav, and footer. Rather than hand-maintain that markup on the form pages, this
lifts it from a page that already has it and swaps in a new <main>.

Run it again whenever the site chrome changes, or when a later phase adds a
form. It is a generator, not a runtime: the files it writes are the source.

    python3 scripts/make-form-page.py
"""

import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent
SITE = ROOT / "site"
SOURCE = SITE / "formation" / "index.html"
BASE_URL = "https://dpeterson01.github.io/ukc-website/"

# The Worker that receives submissions. Until it is deployed this points at the
# production hostname anyway, so switching over is a DNS change, not a code one.
ENDPOINT = "https://forms.ukccatholic.org/submit"

# Nothing answers at ENDPOINT yet, so the form is built but deliberately unlinked.
# Flip this in the same change that points ENDPOINT at a live backend, re-run, and
# restore the two hand-written links in site/new/ and site/formation/.
FORMS_LIVE = False

COMING_SOON = ('<span class="btn btn--ghost" aria-disabled="true"'
               ' style="opacity: 0.55; cursor: default;">Coming soon</span>')

REGISTRATION_CTA = (
    '<a class="btn btn--ghost" href="./parish-registration/">Start the form &rarr;</a>'
    if FORMS_LIVE else COMING_SOON
)

FORMS_INTRO = """No printing, no mailing, no dropping anything in the collection box. Choose a form
          below and we will email you a copy when you are done. Prefer paper? Call the parish
          office at <a href="tel:+15096742531" style="color: var(--color-navy);">(509) 674-2531</a>
          and we will mail you one.""" if FORMS_LIVE else """These are moving online soon, so there will be nothing to print and nothing to mail.
          Until then, call the parish office at
          <a href="tel:+15096742531" style="color: var(--color-navy);">(509) 674-2531</a>
          and we will send you a form."""

PAGES = [
    {
        "path": "forms/index.html",
        "depth": 1,
        "title": "Parish Forms",
        "description": "Register with the parish, sign up for faith formation, "
                       "and enroll in OCIA. Fill everything out online, no printing.",
        "main": """
    <section class="section">
      <div class="section section--narrow">
        <div class="eyebrow" style="margin-bottom: 8px;">Parish forms</div>
        <h1 style="margin-bottom: 8px;">Fill it out online</h1>
        <hr class="rule-gold" style="margin: 0px 0px 20px;">
        <p class="about-history" style="margin-bottom: 32px;">
          __FORMS_INTRO__
        </p>

        <div class="contact-grid">
          <div class="contact-card">
            <h3>Parish registration</h3>
            <p class="feature__body" style="margin-bottom: 12px;">
              Make Immaculate Conception or St. John the Baptist your parish home, or update
              information we already have.
            </p>
            __REGISTRATION_CTA__
          </div>
          <div class="contact-card">
            <h3>Children's faith formation</h3>
            <p class="feature__body" style="margin-bottom: 12px;">
              Religious education for children, Sundays from October through May.
            </p>
            <span class="btn btn--ghost" aria-disabled="true" style="opacity: 0.55; cursor: default;">Coming soon</span>
          </div>
          <div class="contact-card">
            <h3>OCIA enrollment</h3>
            <p class="feature__body" style="margin-bottom: 12px;">
              For adults exploring the Catholic faith or completing their sacraments.
            </p>
            <span class="btn btn--ghost" aria-disabled="true" style="opacity: 0.55; cursor: default;">Coming soon</span>
          </div>
        </div>
      </div>
    </section>
""",
    },
    {
        "path": "forms/parish-registration/index.html",
        "depth": 2,
        "title": "Parish Registration",
        "description": "Register with Immaculate Conception in Roslyn or St. John the Baptist "
                       "in Cle Elum, or update the information the parish office already has.",
        "form": "parish-registration",
        "main": """
    <section class="section">
      <div class="section section--narrow">
        <div class="eyebrow" style="margin-bottom: 8px;">
          <a href="../" style="color: inherit;">Parish forms</a>
        </div>
        <h1 style="margin-bottom: 8px;">Parish Registration</h1>
        <hr class="rule-gold" style="margin: 0px 0px 20px;">

        <div id="ukc-form"
             data-ukc-form="parish-registration"
             data-base="../"
             data-endpoint="__ENDPOINT__"></div>

        <noscript>
          <p class="about-history">
            This form needs JavaScript. Please call the parish office at
            <a href="tel:+15096742531">(509) 674-2531</a> and we will register you over the phone.
          </p>
        </noscript>
      </div>
    </section>
""",
    },
]


def rewrite_depth(html: str, depth: int) -> str:
    """The source page sits one folder deep. Re-point its relative links."""
    prefix = "../" * depth
    html = re.sub(r'((?:href|src)=")\.\./', lambda m: m.group(1) + prefix, html)
    # The chrome came from a page that marks itself current in the nav.
    return html.replace(" is-active", "")


def build(page: str, source: str) -> str:
    head, rest = source.split("</head>", 1)
    body_open, body = rest.split("<main", 1)
    _old_main, after_main = body.split("</main>", 1)
    return head, body_open, after_main


def main() -> None:
    source = SOURCE.read_text(encoding="utf-8")
    head, body_open, after_main = build("", source)

    for page in PAGES:
        depth = page["depth"]
        url = BASE_URL + page["path"].replace("index.html", "")

        new_head = head
        new_head = re.sub(r"<title>.*?</title>",
                          f'<title>{page["title"]} | Catholic Parishes of Upper Kittitas County</title>',
                          new_head, flags=re.S)
        new_head = re.sub(r'(<meta (?:name|property)="(?:og:|twitter:)?(?:description|title)"[^>]*content=")[^"]*(")',
                          lambda m: m.group(1) + (
                              f'{page["title"]} | Catholic Parishes of Upper Kittitas County'
                              if "title" in m.group(0) else page["description"]
                          ) + m.group(2),
                          new_head)
        new_head = re.sub(r'<link rel="canonical"[^>]*>', f'<link rel="canonical" href="{url}">', new_head)

        # The forms engine loads on top of the site stylesheet, never instead of it.
        prefix = "../" * depth
        extras = (
            f'<link rel="stylesheet" href="{prefix}forms/engine/forms.css">\n'
            f'<script src="{prefix}forms/engine/validate.js" defer></script>\n'
            f'<script src="{prefix}forms/engine/signature.js" defer></script>\n'
            f'<script src="{prefix}forms/engine/renderer.js" defer></script>\n'
        ) if page.get("form") else ""

        new_head = rewrite_depth(new_head, depth)
        new_head = new_head.replace("<script src=", extras + "<script src=", 1) if extras else new_head

        # An unlinked form should stay out of search results too.
        if page.get("form") and not FORMS_LIVE:
            new_head += '  <meta name="robots" content="noindex">\n'

        main_html = (page["main"]
                     .replace("__ENDPOINT__", ENDPOINT)
                     .replace("__REGISTRATION_CTA__", REGISTRATION_CTA)
                     .replace("__FORMS_INTRO__", FORMS_INTRO))
        html = (
            new_head
            + "</head>"
            + rewrite_depth(body_open, depth)
            + f'<main data-screen-label="{page["title"]}">'
            + main_html
            + "  </main>"
            + rewrite_depth(after_main, depth)
        )

        target = SITE / page["path"]
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(html, encoding="utf-8")
        print(f"wrote {target.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
