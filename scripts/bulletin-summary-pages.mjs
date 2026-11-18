/* Dated weekly summary pages: /bulletins/<date>/ and /es/bulletins/<date>/.
 *
 * Each page is built from the archive page shell (site/bulletins/index.html or its Spanish twin), so the
 * utility bar, nav and footer match every other page, and from the week's summary file,
 * site/bulletins/<year>/<date>-summary.json. ukc-bulletin writes that file with the same content as the
 * week's email, and publish-bulletin.mjs --summary validates it before storing it.
 *
 * build-bulletins.mjs calls this for every manifest entry with summary: true, and writes the two
 * bulletin sitemaps. The output is committed static HTML like the archive region.
 */

const ORIGIN = 'https://ukccatholic.org';

const COPY = {
  en: {
    crumbs: 'Breadcrumb',
    home: 'Home',
    bulletins: 'Bulletins',
    eyebrow: 'Weekly bulletin',
    open: 'Open full bulletin',
    readings: 'This Sunday’s readings',
    readingsLink: 'Read the full readings at USCCB',
    week: 'This week in our parishes',
    formed: 'This week on FORMED',
    watch: 'Watch free',
    cta: 'One thing you can do',
    share: 'Link to this page',
    weeks: 'More weeks',
    previous: 'Previous week',
    next: 'Next week',
    back: 'All bulletins',
    titleSuffix: ' | Parish Bulletin',
    titleFallback: (date) => `Parish Bulletin, ${date}`,
    descriptionTail: [' Weekly bulletin of St. John the Baptist, Cle Elum, and Immaculate Conception, Roslyn.', ' Readings, reflection and parish news for the week.'],
    aiNotice: null,
  },
  es: {
    crumbs: 'Ruta de navegación',
    home: 'Inicio',
    bulletins: 'Boletines',
    eyebrow: 'Boletín semanal',
    open: 'Abrir PDF en inglés',
    readings: 'Lecturas de este domingo',
    readingsLink: 'Lea las lecturas completas en USCCB',
    week: 'Esta semana en nuestras parroquias',
    formed: 'Esta semana en FORMED',
    watch: 'Ver gratis',
    cta: 'Una invitación para usted',
    share: 'Enlace a esta página',
    weeks: 'Otras semanas',
    previous: 'Semana anterior',
    next: 'Semana siguiente',
    back: 'Todos los boletines',
    titleSuffix: ' | Boletín parroquial',
    titleFallback: (date) => `Boletín parroquial, ${date}`,
    descriptionTail: [' Boletín semanal de San Juan Bautista, Cle Elum, e Inmaculada Concepción, Roslyn.', ' Lecturas, reflexión y noticias parroquiales de la semana.'],
    // Same wording as the Spanish email. It drops once Father's review of the Spanish is recorded.
    aiNotice: 'Esta versión se tradujo con inteligencia artificial y no ha sido revisada por el padre Francisco. Puede contener errores.',
  },
};

const READING_LABELS = ['First Reading', 'Psalm', 'Second Reading', 'Gospel'];

export const escapeHtml = (value) => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;');

const isText = (value) => typeof value === 'string' && value.trim().length > 0;
const isHttps = (value) => typeof value === 'string' && /^https:\/\/[^\s"<>]+$/.test(value);

/* Throws on anything the page cannot render safely. The summary comes from another repo's job, so
 * nothing in it is trusted: every string is escaped on output, and every link must be https. */
export function validateSummary(summary, date) {
  const fail = (message) => { throw new Error(`summary ${date}: ${message}`); };
  if (!summary || summary.version !== 1) fail('expected version 1');
  if (summary.date !== date) fail(`date is ${summary.date}, expected ${date}`);
  if (summary.nabNotice != null && !isText(summary.nabNotice)) fail('nabNotice must be text');
  for (const locale of ['en', 'es']) {
    if (!isHttps(summary.readingsUrl?.[locale])) fail(`readingsUrl.${locale} must be an https URL`);
    const edition = summary[locale];
    if (!edition) fail(`${locale} edition is missing`);
    if (!isText(edition.headline)) fail(`${locale}.headline is missing`);
    if (!isText(edition.title)) fail(`${locale}.title is missing`);
    if (edition.quote && !(isText(edition.quote.text) && isText(edition.quote.ref))) fail(`${locale}.quote needs text and ref`);
    if (edition.notice && !(isText(edition.notice.title) && isText(edition.notice.body))) fail(`${locale}.notice needs title and body`);
    const r = edition.reflection;
    if (r && !(isText(r.head) && Array.isArray(r.body) && r.body.every(isText) && (r.question == null || isText(r.question)))) {
      fail(`${locale}.reflection is malformed`);
    }
    if (!Array.isArray(edition.announcements) || !edition.announcements.every((a) => isText(a?.title) && isText(a?.body))) {
      fail(`${locale}.announcements is malformed`);
    }
    if (edition.formed && !isText(edition.formed.title)) fail(`${locale}.formed needs a title`);
    if (edition.cta && !(isText(edition.cta.label) && (edition.cta.url == null || isHttps(edition.cta.url)))) {
      fail(`${locale}.cta needs a label and an https URL`);
    }
    if (!Array.isArray(edition.readings) || !edition.readings.every((x) => isText(x?.label) && isText(x?.ref))) {
      fail(`${locale}.readings is malformed`);
    }
  }
  if (summary.en.readings.some((x) => !READING_LABELS.includes(x.label))) fail('unknown English reading label');
  if (summary.es.translationReviewed != null && typeof summary.es.translationReviewed !== 'boolean') {
    fail('es.translationReviewed must be true or false');
  }
  return summary;
}

export const summaryUrl = (date, locale) => `${ORIGIN}/${locale === 'es' ? 'es/' : ''}bulletins/${date}/`;

function pageTitle(headline, dateText, copy) {
  const full = `${headline}${copy.titleSuffix}`;
  if (full.length <= 60) return full;
  if (headline.length <= 60) return headline;
  return copy.titleFallback(dateText);
}

/* 120 to 160 characters (verify-seo.mjs): the headline and the opening of the reflection or notice,
 * then the parish lines while it is still short, cut at a word when it runs long. */
export function pageDescription(edition, copy) {
  const lead = edition.reflection?.body?.[0] ?? edition.notice?.body ?? edition.announcements[0]?.body ?? '';
  let text = `${edition.headline} ${lead}`.replace(/\s+/g, ' ').trim();
  for (const tail of copy.descriptionTail) if (text.length < 120) text += tail;
  if (text.length > 160) {
    const cut = text.slice(0, 159);
    const word = cut.lastIndexOf(' ');
    text = `${(word >= 120 ? cut.slice(0, word) : cut).replace(/[\s,;:.]+$/, '')}…`;
  }
  return text;
}

// JSON inside <script> must not be able to close the tag.
const jsonForScript = (value) => JSON.stringify(value).replaceAll('<', '\\u003c');

function head(shell, { locale, date, title, description, english, spanish }) {
  const canonical = locale === 'es' ? spanish : english;
  const replacements = [
    [/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(title)}</title>`],
    [/<meta name="description" content="[^"]*">/, `<meta name="description" content="${escapeHtml(description)}">`],
    [/<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${escapeHtml(title)}">`],
    [/<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${escapeHtml(description)}">`],
    [/<meta property="og:type" content="[^"]*">/, '<meta property="og:type" content="article">'],
    [/<meta property="og:url" content="[^"]*">/, `<meta property="og:url" content="${canonical}">`],
    [/<meta name="twitter:title" content="[^"]*">/, `<meta name="twitter:title" content="${escapeHtml(title)}">`],
    [/<meta name="twitter:description" content="[^"]*">/, `<meta name="twitter:description" content="${escapeHtml(description)}">`],
    [/<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${canonical}">`],
    [/<link rel="alternate" hreflang="en" href="[^"]*">/, `<link rel="alternate" hreflang="en" href="${english}">`],
    [/<link rel="alternate" hreflang="es" href="[^"]*">/, `<link rel="alternate" hreflang="es" href="${spanish}">`],
    [/<link rel="alternate" hreflang="x-default" href="[^"]*">/, `<link rel="alternate" hreflang="x-default" href="${english}">`],
  ];
  let html = shell;
  for (const [pattern, value] of replacements) {
    if (!pattern.test(html)) throw new Error(`archive shell is missing ${pattern}`);
    html = html.replace(pattern, () => value);
  }
  // One level deeper than the archive page, so every relative link and asset gains one "../".
  html = html.replaceAll('href="../', 'href="../../').replaceAll('src="../', 'src="../../');
  const toggle = locale === 'es' ? `../../../bulletins/${date}/` : `../../es/bulletins/${date}/`;
  html = html.replace(/(<a class="utility-bar__lang" href=")[^"]*(")/, `$1${toggle}$2`);
  return html;
}

function breadcrumbJson({ copy, locale, date, dateText, url }) {
  const base = `${ORIGIN}/${locale === 'es' ? 'es/' : ''}`;
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: copy.home, item: base },
      { '@type': 'ListItem', position: 2, name: copy.bulletins, item: `${base}bulletins/` },
      { '@type': 'ListItem', position: 3, name: dateText, item: url },
    ],
  };
}

/**
 * @param shell the archive page for this locale, as committed
 * @param issue the manifest entry (date, path, bytes)
 * @param summary the validated summary
 * @param neighbours { previous, next } manifest entries with summaries, or null
 * @param format { date(value, locale), size(bytes, locale) } from build-bulletins.mjs
 */
export function summaryPage({ shell, locale, issue, summary, neighbours = {}, format }) {
  const copy = COPY[locale];
  const edition = summary[locale];
  const date = issue.date;
  const dateText = format.date(date, locale);
  const english = summaryUrl(date, 'en');
  const spanish = summaryUrl(date, 'es');
  const url = locale === 'es' ? spanish : english;
  const title = pageTitle(edition.headline, dateText, copy);
  const description = pageDescription(edition, copy);
  const showAiNotice = locale === 'es' && summary.es.translationReviewed !== true;
  const labelFor = (reading, index) => (locale === 'es' ? reading.label : (READING_LABELS.includes(reading.label) ? reading.label : READING_LABELS[index]));
  const event = (name, position = 'summary') => `data-event="${name}" data-event-position="${position}" data-event-locale="${locale}" data-event-issue="${date}"`;
  const weekLink = (other, rel, label) => (other
    ? `<a class="summary-weeks__${rel}" href="../${other.date}/" rel="${rel}"><span class="summary-weeks__label">${label}</span> ${escapeHtml(other.headline?.[locale] ?? format.date(other.date, locale))}</a>`
    : '');

  const sections = [
    showAiNotice ? `<p class="summary-ai-notice">${copy.aiNotice}</p>` : '',
    [
      '<div class="summary-actions">',
      `  <a class="btn btn--primary summary-actions__pdf" href="${issue.path}" ${event('bulletin_pdf_open')}>${copy.open} <span class="bulletin-latest-card__size">(PDF, ${format.size(issue.bytes, locale)})</span></a>`,
      '</div>',
    ].join('\n'),
    edition.notice ? [
      '<aside class="summary-notice" aria-labelledby="summary-notice-title">',
      `  <h2 id="summary-notice-title">${escapeHtml(edition.notice.title)}</h2>`,
      `  <p>${escapeHtml(edition.notice.body)}</p>`,
      '</aside>',
    ].join('\n') : '',
    edition.quote ? [
      '<figure class="summary-scripture">',
      `  <blockquote><p>${escapeHtml(edition.quote.text)}</p></blockquote>`,
      `  <figcaption>${escapeHtml(edition.quote.ref)}</figcaption>`,
      '</figure>',
    ].join('\n') : '',
    edition.readings.length ? [
      '<section class="summary-block" aria-labelledby="summary-readings">',
      `  <h2 id="summary-readings">${copy.readings}</h2>`,
      '  <ul class="summary-readings">',
      ...edition.readings.map((reading, index) => `    <li><span class="summary-readings__label">${escapeHtml(labelFor(reading, index))}</span> ${escapeHtml(reading.ref)}</li>`),
      '  </ul>',
      `  <p><a href="${escapeHtml(summary.readingsUrl[locale])}" rel="noopener">${copy.readingsLink}</a></p>`,
      '</section>',
    ].join('\n') : '',
    edition.reflection ? [
      '<section class="summary-block" aria-labelledby="summary-reflection">',
      `  <h2 id="summary-reflection">${escapeHtml(edition.reflection.head)}</h2>`,
      ...edition.reflection.body.map((paragraph) => `  <p>${escapeHtml(paragraph)}</p>`),
      edition.reflection.question ? `  <p class="summary-question">${escapeHtml(edition.reflection.question)}</p>` : '',
      '</section>',
    ].filter(Boolean).join('\n') : '',
    edition.announcements.length ? [
      '<section class="summary-block" aria-labelledby="summary-week">',
      `  <h2 id="summary-week">${copy.week}</h2>`,
      ...edition.announcements.flatMap((item) => [
        '  <article class="summary-item">',
        `    <h3>${escapeHtml(item.title)}</h3>`,
        `    <p>${escapeHtml(item.body)}</p>`,
        '  </article>',
      ]),
      '</section>',
    ].join('\n') : '',
    edition.formed ? [
      '<section class="summary-block" aria-labelledby="summary-formed">',
      `  <h2 id="summary-formed">${copy.formed}</h2>`,
      `  <p><strong>${escapeHtml(edition.formed.title)}</strong>${edition.formed.blurb ? ` ${escapeHtml(edition.formed.blurb)}` : ''} <a href="https://formed.org" rel="noopener">${copy.watch}</a></p>`,
      '</section>',
    ].join('\n') : '',
    edition.cta?.url ? [
      '<section class="summary-block summary-cta" aria-labelledby="summary-cta">',
      `  <h2 id="summary-cta">${copy.cta}</h2>`,
      `  <a class="btn btn--secondary" href="${escapeHtml(edition.cta.url)}" rel="noopener">${escapeHtml(edition.cta.label)}</a>`,
      '</section>',
    ].join('\n') : '',
    `<p class="summary-share">${copy.share}: <a href="${url}">${url.replace(/^https:\/\//, '')}</a></p>`,
    neighbours.previous || neighbours.next ? [
      `<nav class="summary-weeks" aria-label="${copy.weeks}">`,
      weekLink(neighbours.previous, 'prev', copy.previous) && `  ${weekLink(neighbours.previous, 'prev', copy.previous)}`,
      weekLink(neighbours.next, 'next', copy.next) && `  ${weekLink(neighbours.next, 'next', copy.next)}`,
      '</nav>',
    ].filter(Boolean).join('\n') : '',
    `<p class="summary-back"><a href="../">&larr; ${copy.back}</a></p>`,
    locale === 'en' && summary.nabNotice ? `<p class="summary-legal">${escapeHtml(summary.nabNotice)}</p>` : '',
  ].filter(Boolean);

  const indent = (text, depth) => text.split('\n').map((line) => (line ? '  '.repeat(depth) + line : line)).join('\n');
  const under = [escapeHtml(edition.title), `<time datetime="${date}">${dateText}</time>`];
  const main = [
    '<!-- Generated by scripts/build-bulletins.mjs from this week\'s summary file. Edit that script, not this page. -->',
    '<header class="page-header summary-header">',
    `  <nav class="summary-crumbs" aria-label="${copy.crumbs}"><ol><li><a href="../../">${copy.home}</a></li><li><a href="../">${copy.bulletins}</a></li><li aria-current="page">${dateText}</li></ol></nav>`,
    `  <div class="page-header__eyebrow">${copy.eyebrow}</div>`,
    `  <h1>${escapeHtml(edition.headline)}</h1>`,
    `  <p class="page-header__lead">${under.join(' · ')}</p>`,
    '</header>',
    `<div class="section summary summary--${issue.season ?? summary.season ?? 'ordinary'}">`,
    ...sections.map((section) => indent(section, 1)),
    '</div>',
  ].join('\n');

  let html = head(shell, { locale, date, title, description, english, spanish });
  const region = /( *)<header class="page-header">[\s\S]*?<!-- bulletins:end -->/;
  const match = html.match(region);
  if (!match) throw new Error('archive shell is missing its page header and bulletins region');
  html = html.replace(region, () => indent(main, match[1].length / 2));
  const breadcrumb = `<script type="application/ld+json">${jsonForScript(breadcrumbJson({ copy, locale, date, dateText, url }))}</script>`;
  html = html.replace('</head>', () => `${breadcrumb}\n</head>`);
  return html;
}

export function sitemap(urls) {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!-- Generated by scripts/build-bulletins.mjs: one URL per weekly summary page. -->',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls.map((url) => `  <url><loc>${url}</loc></url>`),
    '</urlset>',
    '',
  ].join('\n');
}
