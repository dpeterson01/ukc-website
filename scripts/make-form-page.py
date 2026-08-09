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
BASE_URL = "https://ukccatholic.org/"

# The Worker that receives submissions. Until it is deployed this points at the
# production hostname anyway, so switching over is a DNS change, not a code one.
ENDPOINT = "https://forms.ukccatholic.org/submit"

# Nothing answers at ENDPOINT yet, so the form is built but deliberately unlinked.
FORMS_LIVE = True

COMING_SOON = {
    "en": ('<span class="btn btn--ghost" aria-disabled="true"'
           ' style="opacity: 0.55; cursor: default;">Coming soon</span>'),
    "es": ('<span class="btn btn--ghost" aria-disabled="true"'
           ' style="opacity: 0.55; cursor: default;">Muy pronto</span>'),
}
START = {"en": "Start the form &rarr;", "es": "Comenzar el formulario &rarr;"}


def cta(lang: str, slug: str) -> str:
    """Every card on the index links to its form once the backend is live."""
    if not FORMS_LIVE:
        return COMING_SOON[lang]
    return f'<a class="btn btn--ghost" href="./{slug}/">{START[lang]}</a>'


FORMS_INTRO = {
    "en": ("""No printing, no mailing, no dropping anything in the collection box. Choose a form
          below and we will email you a copy when you are done. Prefer paper? Call the parish
          office at <a href="tel:+15096742531" style="color: var(--color-navy);">(509) 674-2531</a>
          and we will mail you one."""
           if FORMS_LIVE else
           """These are moving online soon, so there will be nothing to print and nothing to mail.
          Until then, call the parish office at
          <a href="tel:+15096742531" style="color: var(--color-navy);">(509) 674-2531</a>
          and we will send you a form."""),
    "es": ("""Nada que imprimir, nada que enviar por correo. Elija un formulario y le enviaremos
          una copia por correo electrónico al terminar. ¿Prefiere papel? Llame a la oficina
          parroquial al <a href="tel:+15096742531" style="color: var(--color-navy);">(509) 674-2531</a>
          y se lo enviaremos."""
           if FORMS_LIVE else
           """Pronto estarán en línea, así que no habrá nada que imprimir ni nada que enviar por correo.
          Mientras tanto, llame a la oficina parroquial al
          <a href="tel:+15096742531" style="color: var(--color-navy);">(509) 674-2531</a>
          y le enviaremos un formulario."""),
}

# Every form page is the same shell around a different mount point. Keeping one
# template means a fix to the noscript fallback reaches all eight pages.
FORM_PAGE = """
    <section class="section">
      <div class="section section--narrow">
        <div class="eyebrow" style="margin-bottom: 8px;">
          <a href="../" style="color: inherit;">{crumb}</a>
        </div>
        <h1 style="margin-bottom: 8px;">{heading}</h1>
        <hr class="rule-gold" style="margin: 0px 0px 20px;">
        <p class="about-history" style="margin-bottom: 28px;">{intro}</p>

        <div id="ukc-form"
             data-ukc-form="{slug}"
             data-base="__DATA_BASE__"
             data-lang="__LANG__"
             data-endpoint="__ENDPOINT__"></div>

        <noscript>
          <p class="about-history">
            {noscript}
          </p>
        </noscript>
      </div>
    </section>
"""

FORMS_INDEX = """
    <section class="section">
      <div class="section section--narrow">
        <div class="eyebrow" style="margin-bottom: 8px;">{crumb}</div>
        <h1 style="margin-bottom: 8px;">{heading}</h1>
        <hr class="rule-gold" style="margin: 0px 0px 20px;">
        <p class="about-history" style="margin-bottom: 32px;">
          {intro}
        </p>

        <div class="contact-grid">
{cards}
        </div>
      </div>
    </section>
"""

CARD = """          <div class="contact-card">
            <h3>{heading}</h3>
            <p class="feature__body" style="margin-bottom: 12px;">
              {body}
            </p>
            {cta}
          </div>"""

CRUMB = {"en": "Parish forms", "es": "Formularios parroquiales"}

NOSCRIPT = {
    "en": ('This form needs JavaScript. Please call the parish office at\n'
           '            <a href="tel:+15096742531">(509) 674-2531</a> and {tail}.'),
    "es": ('Este formulario necesita JavaScript. Por favor llame a la oficina parroquial al\n'
           '            <a href="tel:+15096742531">(509) 674-2531</a> y {tail}.'),
}

# Card copy for the index, in the order the cards appear.
CARDS = {
    "en": [
        ("parish-registration", "Parish registration",
         "Make Immaculate Conception or St. John the Baptist your parish home, or update\n"
         "              information we already have."),
        ("faith-formation", "Children's faith formation",
         "Religious education for children, Sundays from October through May.\n"
         "              One form covers every child in the household."),
        ("ocia-participant", "OCIA inquiry",
         "For adults exploring the Catholic faith or completing their sacraments.\n"
         "              Asking questions commits you to nothing."),
        ("ocia-sponsor", "OCIA sponsor",
         "For confirmed Catholics willing to walk alongside someone coming into\n"
         "              the Church this year."),
    ],
    "es": [
        ("parish-registration", "Inscripción parroquial",
         "Haga de La Inmaculada Concepción o de San Juan Bautista su parroquia, o actualice\n"
         "              los datos que ya tenemos."),
        ("faith-formation", "Formación en la fe para niños",
         "Educación religiosa para niños, los domingos de octubre a mayo.\n"
         "              Un solo formulario para todos los hijos de la familia."),
        ("ocia-participant", "Consulta sobre OCIA",
         "Para adultos que desean conocer la fe católica o completar sus sacramentos.\n"
         "              Preguntar no lo compromete a nada."),
        ("ocia-sponsor", "Padrino o madrina de OCIA",
         "Para católicos confirmados dispuestos a acompañar durante un año a alguien\n"
         "              que entra en la Iglesia."),
    ],
}


def forms_index(lang: str) -> str:
    cards = "\n".join(
        CARD.format(heading=h, body=b, cta=cta(lang, slug))
        for slug, h, b in CARDS[lang]
    )
    return FORMS_INDEX.format(
        crumb=CRUMB[lang],
        heading="Fill it out online" if lang == "en" else "Llénelo en línea",
        intro=FORMS_INTRO[lang],
        cards=cards,
    )


def form_page(lang: str, slug: str, heading: str, intro: str, tail: str) -> str:
    return FORM_PAGE.format(
        crumb=CRUMB[lang],
        heading=heading,
        intro=intro,
        slug=slug,
        noscript=NOSCRIPT[lang].format(tail=tail),
    )


# Each entry describes one page in both trees. The Spanish copy here is the
# translation that was already on the site, not a fresh machine rendering.
PAGES = [
    {
        "path": "forms/index.html",
        "en": {
            "title": "Parish Forms",
            "description": "Register with St. John the Baptist or Immaculate Conception, "
                           "sign up for faith formation, or enroll in OCIA with our secure "
                           "online parish forms.",
            "main": forms_index("en"),
        },
        "es": {
            "title": "Formularios parroquiales",
            "description": "Inscríbase como feligrés, apúntese a la formación en la fe e "
                           "inscríbase en OCIA. Todo se llena en línea, sin imprimir nada.",
            "main": forms_index("es"),
        },
    },
    {
        "path": "forms/parish-registration/index.html",
        "form": "parish-registration",
        "en": {
            "title": "Parish Registration",
            "description": "Register with Immaculate Conception in Roslyn or St. John the Baptist "
                           "in Cle Elum, or update the information the parish office already has.",
            "main": form_page(
                "en", "parish-registration", "Parish Registration",
                "This takes about ten minutes and saves as you go, so you can stop and come back.",
                "we will register you over the phone"),
        },
        "es": {
            "title": "Inscripción parroquial",
            "description": "Inscríbase en La Inmaculada Concepción en Roslyn o en San Juan Bautista "
                           "en Cle Elum, o actualice los datos que la oficina parroquial ya tiene.",
            "main": form_page(
                "es", "parish-registration", "Inscripción parroquial",
                "Toma unos diez minutos y se guarda solo, así que puede parar y volver después.",
                "lo inscribiremos por teléfono"),
        },
    },
    {
        "path": "forms/faith-formation/index.html",
        "form": "faith-formation",
        "en": {
            "title": "Faith Formation",
            "description": "Register your children for religious education at Immaculate "
                           "Conception in Roslyn or St. John the Baptist in Cle Elum. "
                           "One form per household.",
            "main": form_page(
                "en", "faith-formation", "Faith Formation Registration",
                "One form covers every child in your household. It takes about ten minutes, "
                "and it saves as you go, so you can stop and come back.",
                "we will register your children over the phone"),
        },
        "es": {
            "title": "Formación en la fe",
            "description": "Inscriba a sus hijos en la educación religiosa de La Inmaculada "
                           "Concepción en Roslyn o de San Juan Bautista en Cle Elum. "
                           "Un formulario por familia.",
            "main": form_page(
                "es", "faith-formation", "Inscripción para la formación en la fe",
                "Un solo formulario para todos los hijos de la familia. Toma unos diez minutos "
                "y se guarda solo, así que puede parar y volver después.",
                "inscribiremos a sus hijos por teléfono"),
        },
    },
    {
        "path": "forms/ocia-participant/index.html",
        "form": "ocia-participant",
        "en": {
            "title": "OCIA Inquiry",
            "description": "For adults exploring the Catholic faith, completing their sacraments, "
                           "or returning to the Church in Cle Elum and Roslyn. Ask anything.",
            "main": form_page(
                "en", "ocia-participant", "OCIA Inquiry",
                "Some of what this asks is personal. Answer what you can and leave the rest "
                "blank. Sending it commits you to nothing.",
                "we will take your information over the phone"),
        },
        "es": {
            "title": "Consulta sobre OCIA",
            "description": "Para adultos que desean conocer la fe católica, completar sus "
                           "sacramentos o volver a la Iglesia en Cle Elum y Roslyn. "
                           "Pregunte lo que quiera.",
            "main": form_page(
                "es", "ocia-participant", "Consulta sobre OCIA",
                "Algunas preguntas son personales. Conteste lo que pueda y deje el resto en "
                "blanco. Enviarlo no lo compromete a nada.",
                "tomaremos sus datos por teléfono"),
        },
    },
    {
        "path": "forms/ocia-sponsor/index.html",
        "form": "ocia-sponsor",
        "en": {
            "title": "OCIA Sponsor",
            "description": "Volunteer to sponsor an adult coming into the Catholic Church at "
                           "Immaculate Conception in Roslyn or St. John the Baptist in Cle Elum.",
            "main": form_page(
                "en", "ocia-sponsor", "OCIA Sponsor",
                "Sponsors walk with a candidate for a year. The first step reads through what "
                "that actually involves before it asks you for anything.",
                "we will take your information over the phone"),
        },
        "es": {
            "title": "Padrino o madrina",
            "description": "Sea padrino o madrina de un adulto que entra en la Iglesia católica "
                           "en La Inmaculada Concepción en Roslyn o en San Juan Bautista en "
                           "Cle Elum.",
            "main": form_page(
                "es", "ocia-sponsor", "Padrino o madrina de OCIA",
                "Los padrinos acompañan a un candidato durante un año. El primer paso explica "
                "lo que eso significa antes de pedirle cualquier dato.",
                "tomaremos sus datos por teléfono"),
        },
    },
]


def rewrite_depth(html: str, depth: int, source_depth: int = 1) -> str:
    """Re-point the source page's relative links at the depth we are writing to.

    Links are not all relative to the same place. On a Spanish page, '../new/'
    means somewhere else inside /es/ while '../../assets/' reaches the site root,
    so the rewrite has to work from what each link actually resolves to rather
    than assuming every link climbs the same number of levels.
    """
    def climb(match):
        hops = len(match.group(2)) // 3
        target_level = source_depth - hops
        return match.group(1) + "../" * (depth - target_level)

    html = re.sub(r'((?:href|src)=")((?:\.\./)+)', climb, html)
    # The chrome came from a page that marks itself current in the nav.
    return html.replace(" is-active", "")


def build(source: str):
    head, rest = source.split("</head>", 1)
    body_open, body = rest.split("<main", 1)
    _old_main, after_main = body.split("</main>", 1)
    return head, body_open, after_main


# Each tree borrows its chrome from the equivalent page in its own language, so
# the Spanish pages get Spanish nav and footer without any of it living here.
TREES = {
    "en": {
        "source": SITE / "formation" / "index.html",
        "out_prefix": "",
        "depth_extra": 0,
        "data_base": "../",
        "site_title": "Cle Elum &amp; Roslyn Catholic Parishes",
    },
    "es": {
        "source": SITE / "es" / "formation" / "index.html",
        "out_prefix": "es/",
        "depth_extra": 1,
        "data_base": "../../../forms/",
        "site_title": "Parroquias de Cle Elum y Roslyn",
    },
}


def render(lang: str, tree: dict, page: dict, head: str, body_open: str,
           after_main: str, site_title: str) -> str:
    copy = page[lang]
    rel = page["path"].replace("index.html", "")
    depth = rel.count("/") + tree["depth_extra"]
    source_depth = 1 + tree["depth_extra"]
    url = BASE_URL + rel
    es_url = BASE_URL + "es/" + rel
    self_url = es_url if lang == "es" else url

    new_head = head
    new_head = re.sub(r"<title>.*?</title>",
                      lambda m: f'<title>{copy["title"]} | {site_title}</title>',
                      new_head, flags=re.S)
    new_head = re.sub(r'(<meta (?:name|property)="(?:og:|twitter:)?(?:description|title)"[^>]*content=")[^"]*(")',
                      lambda m: m.group(1) + (
                          f'{copy["title"]} | {site_title}'
                          if "title" in m.group(0) else copy["description"]
                      ) + m.group(2),
                      new_head)
    new_head = re.sub(r'<link rel="canonical"[^>]*>',
                      f'<link rel="canonical" href="{self_url}">', new_head)

    # og:url is page-specific as well, and would otherwise stay on /formation/.
    new_head = re.sub(r'(<meta property="og:url" content=")[^"]*(")',
                      lambda m: m.group(1) + self_url + m.group(2), new_head)

    # The chrome carries the source page's hreflang set, which would otherwise
    # point both form pages at /formation/.
    for tag, href in (("en", url), ("es", es_url), ("x-default", url)):
        new_head = re.sub(rf'<link rel="alternate" hreflang="{tag}"[^>]*>',
                          f'<link rel="alternate" hreflang="{tag}" href="{href}">', new_head)

    # The forms engine loads on top of the site stylesheet, never instead of it.
    prefix = "../" * depth
    engine = prefix + "forms/"
    extras = (
        f'<link rel="stylesheet" href="{engine}engine/forms.css">\n'
        f'<script src="{engine}engine/i18n.js" defer></script>\n'
        f'<script src="{engine}engine/validate.js" defer></script>\n'
        f'<script src="{engine}engine/signature.js" defer></script>\n'
        f'<script src="{engine}engine/renderer.js" defer></script>\n'
    ) if page.get("form") else ""

    new_head = rewrite_depth(new_head, depth, source_depth)
    if extras:
        new_head = new_head.replace("<script src=", extras + "<script src=", 1)

    # An unlinked form should stay out of search results too.
    noindex = page.get("form") and not FORMS_LIVE
    if noindex:
        new_head += '  <meta name="robots" content="noindex">\n'

    # The utility bar's language toggle inherits the source page's target.
    other = (prefix + "es/" + rel) if lang == "en" else (prefix + rel)
    new_body_open = re.sub(r'(<a class="utility-bar__lang" href=")[^"]*(")',
                           lambda m: m.group(1) + other + m.group(2),
                           rewrite_depth(body_open, depth, source_depth))

    main_html = (copy["main"]
                 .replace("__ENDPOINT__", ENDPOINT)
                 .replace("__LANG__", lang)
                 .replace("__DATA_BASE__", tree["data_base"]))

    return (
        new_head
        + "</head>"
        + new_body_open
        + f'<main data-screen-label="{page["en"]["title"]}">'
        + main_html
        + "  </main>"
        + rewrite_depth(after_main, depth, source_depth)
    )


def main() -> None:
    for lang, tree in TREES.items():
        source = tree["source"].read_text(encoding="utf-8")
        head, body_open, after_main = build(source)

        # Read off the source page so a change to the site title reaches here too.
        found = re.search(r"<title>[^|<]*\|\s*([^<]*)</title>", source)
        site_title = found.group(1).strip() if found else tree["site_title"]

        for page in PAGES:
            html = render(lang, tree, page, head, body_open, after_main, site_title)
            target = SITE / (tree["out_prefix"] + page["path"])
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(html, encoding="utf-8")
            print(f"wrote {target.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
