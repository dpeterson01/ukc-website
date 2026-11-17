/* Writes the bulletin archive into the English and Spanish archive pages.
 *
 * Reads site/bulletins/index.json and replaces the region between the
 * bulletins:start and bulletins:end markers in site/bulletins/index.html and
 * site/es/bulletins/index.html. Everything outside the markers stays hand-edited.
 * The output is plain static HTML, so the archive works with no JavaScript and
 * with the manifest unreachable. There is no build step at deploy time: the
 * generated HTML is committed, and publish-bulletin.mjs reruns this after every
 * publish. verify-bulletins.mjs fails CI when the committed HTML is stale.
 *
 *   node scripts/build-bulletins.mjs            rewrite both pages
 *   node scripts/build-bulletins.mjs --check    exit 1 if either page is stale
 *
 * Dates and sizes are formatted here, not with Intl, so the output is the same
 * on every machine.
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const defaultSiteRoot = path.resolve(import.meta.dirname, '..', 'site');
const START = '<!-- bulletins:start -->';
const END = '<!-- bulletins:end -->';
const SEASONS = new Set(['advent', 'christmas', 'lent', 'easter', 'ordinary']);

const COPY = {
  en: {
    months: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
    weekdays: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    date: (weekday, day, month, year) => `${weekday}, ${month} ${day}, ${year}`,
    decimal: '.',
    fallbackTitle: 'Weekly Parish Bulletin',
    latest: 'Latest bulletin',
    open: 'Open full bulletin',
    pdf: 'PDF',
    previous: 'Previous weeks',
    earlier: 'Earlier bulletins',
    emptyLatest: 'No bulletins have been published yet.',
    signupLead: 'Get the bulletin by email each week.',
    signup: 'Sign up for email',
    signupHref: '../email/',
    note: '',
  },
  es: {
    months: ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'],
    weekdays: ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'],
    date: (weekday, day, month, year) => `${weekday}, ${day} de ${month} de ${year}`,
    decimal: ',',
    fallbackTitle: 'Boletín parroquial semanal',
    latest: 'Boletín más reciente',
    open: 'Abrir PDF en inglés',
    pdf: 'PDF en inglés',
    previous: 'Semanas anteriores',
    earlier: 'Boletines anteriores',
    emptyLatest: 'Todavía no hay boletines publicados.',
    signupLead: 'Reciba el boletín por correo electrónico cada semana.',
    signup: 'Suscribirse por correo',
    signupHref: '../email/',
    note: 'Por ahora el boletín completo en PDF solo está disponible en inglés.',
  },
};

const escapeHtml = (value) => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;');

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

/* Same acceptance rule as the browser script: a well-formed date, the PDF at
 * its canonical path, a positive size, and one entry per date. */
export function publishedIssues(issues) {
  if (!Array.isArray(issues)) throw new Error('manifest has no issues array');
  const seen = new Set();
  return issues.filter((issue) => {
    if (!issue || !validDate(issue.date) || seen.has(issue.date)) return false;
    if (issue.path !== `/bulletins/${issue.date.slice(0, 4)}/${issue.date}-bulletin.pdf`) return false;
    if (!Number.isFinite(issue.bytes) || issue.bytes <= 0) return false;
    seen.add(issue.date);
    return true;
  }).sort((left, right) => right.date.localeCompare(left.date));
}

export function formatDate(value, locale) {
  const copy = COPY[locale];
  const date = new Date(`${value}T00:00:00Z`);
  return copy.date(copy.weekdays[date.getUTCDay()], date.getUTCDate(), copy.months[date.getUTCMonth()], date.getUTCFullYear());
}

export function formatSize(bytes, locale) {
  if (bytes < 1048576) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1048576).toFixed(1).replace('.', COPY[locale].decimal)} MB`;
}

function title(issue, locale) {
  const value = issue.liturgicalTitle?.[locale];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function season(issue) {
  return SEASONS.has(issue.season) ? issue.season : 'ordinary';
}

function eventAttributes(event, position, issue, locale) {
  return `data-event="${event}" data-event-position="${position}" data-event-locale="${locale}"`
    + (issue ? ` data-event-issue="${issue.date}"` : '');
}

function latestCard(issue, locale) {
  const copy = COPY[locale];
  const date = formatDate(issue.date, locale);
  const heading = title(issue, locale) ?? date;
  const size = formatSize(issue.bytes, locale);
  return [
    `<article class="bulletin-latest-card bulletin-latest-card--${season(issue)}" aria-labelledby="bulletin-latest-title">`,
    `  <p class="eyebrow bulletin-latest-card__eyebrow">${copy.latest}</p>`,
    `  <h2 class="bulletin-latest-card__title" id="bulletin-latest-title">${escapeHtml(heading)}</h2>`,
    heading === date ? '' : `  <p class="bulletin-latest-card__date"><time datetime="${issue.date}">${date}</time></p>`,
    `  <a class="btn btn--primary bulletin-latest-card__pdf" href="${issue.path}" ${eventAttributes('bulletin_pdf_open', 'latest', issue, locale)}>${copy.open} <span class="bulletin-latest-card__size">(PDF, ${size})</span></a>`,
    copy.note ? `  <p class="bulletin-latest-card__note">${copy.note}</p>` : '',
    '</article>',
  ].filter(Boolean).join('\n');
}

function row(issue, locale, position) {
  const copy = COPY[locale];
  const date = formatDate(issue.date, locale);
  const heading = title(issue, locale);
  return [
    `<li class="bulletin-row bulletin-row--${season(issue)}">`,
    `  <a class="bulletin-row__link" href="${issue.path}" ${eventAttributes('bulletin_pdf_open', position, issue, locale)}>`,
    `    <span class="bulletin-row__title">${escapeHtml(heading ?? date)}</span>`,
    `    <span class="bulletin-row__meta">${heading ? `<time datetime="${issue.date}">${date}</time> · ` : ''}${copy.pdf}, ${formatSize(issue.bytes, locale)}</span>`,
    '  </a>',
    '</li>',
  ].join('\n');
}

export function archiveMarkup(manifest, locale) {
  if (!COPY[locale]) throw new Error(`unsupported locale ${locale}`);
  const copy = COPY[locale];
  const issues = publishedIssues(manifest.issues);
  const indent = (text, depth) => text.split('\n').map((line) => (line ? '  '.repeat(depth) + line : line)).join('\n');
  const parts = [];
  if (!issues.length) {
    parts.push(`<p class="bulletin-archive__status">${copy.emptyLatest}</p>`);
  } else {
    parts.push(latestCard(issues[0], locale));
  }
  parts.push([
    '<p class="bulletin-signup">',
    `  ${copy.signupLead} <a href="${copy.signupHref}" ${eventAttributes('bulletin_signup_click', 'archive', null, locale)}>${copy.signup}</a>`,
    '</p>',
  ].join('\n'));
  const previous = issues.slice(1, 4);
  if (previous.length) {
    parts.push([
      '<section class="bulletin-group" aria-labelledby="bulletin-previous">',
      `  <h2 class="bulletin-group__heading" id="bulletin-previous">${copy.previous}</h2>`,
      '  <ul class="bulletin-list">',
      ...previous.map((issue) => indent(row(issue, locale, 'recent'), 2)),
      '  </ul>',
      '</section>',
    ].join('\n'));
  }
  const older = issues.slice(4);
  if (older.length) {
    const years = [...new Set(older.map((issue) => issue.date.slice(0, 4)))];
    parts.push([
      '<section class="bulletin-group" aria-labelledby="bulletin-earlier">',
      `  <h2 class="bulletin-group__heading" id="bulletin-earlier">${copy.earlier}</h2>`,
      ...years.flatMap((year) => [
        `  <h3 class="bulletin-group__year" id="bulletin-year-${year}">${year}</h3>`,
        `  <ul class="bulletin-list" aria-labelledby="bulletin-year-${year}">`,
        ...older.filter((issue) => issue.date.startsWith(year)).map((issue) => indent(row(issue, locale, 'older'), 2)),
        '  </ul>',
      ]),
      '</section>',
    ].join('\n'));
  }
  return [
    `${START}`,
    '<!-- Generated by scripts/build-bulletins.mjs from site/bulletins/index.json. Edit that script, not this region. -->',
    '<div class="section bulletin-archive">',
    ...parts.map((part) => indent(part, 1)),
    '</div>',
    `${END}`,
  ].join('\n');
}

export function replaceRegion(html, markup, file) {
  const start = html.indexOf(START);
  const end = html.indexOf(END);
  if (start < 0 || end < start || html.indexOf(START, start + 1) >= 0) {
    throw new Error(`${file} needs exactly one ${START} … ${END} region`);
  }
  const lineStart = html.lastIndexOf('\n', start) + 1;
  const indent = html.slice(lineStart, start);
  const body = markup.split('\n').map((line, index) => (index && line ? indent + line : line)).join('\n');
  return html.slice(0, start) + body + html.slice(end + END.length);
}

export async function buildBulletins({ siteRoot = defaultSiteRoot, check = false } = {}) {
  const manifest = JSON.parse(await readFile(path.join(siteRoot, 'bulletins', 'index.json'), 'utf8'));
  if (manifest.version !== 1) throw new Error('bulletin manifest must be version 1');
  const stale = [];
  const written = [];
  for (const locale of ['en', 'es']) {
    const file = path.join(siteRoot, ...(locale === 'es' ? ['es'] : []), 'bulletins', 'index.html');
    const html = await readFile(file, 'utf8');
    const next = replaceRegion(html, archiveMarkup(manifest, locale), file);
    if (next === html) continue;
    if (check) stale.push(file);
    else {
      await writeFile(file, next);
      written.push(file);
    }
  }
  return { stale, written };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes('--check');
  try {
    const { stale, written } = await buildBulletins({ check });
    if (check && stale.length) {
      console.error(`build-bulletins: stale archive HTML, run node scripts/build-bulletins.mjs:\n  ${stale.join('\n  ')}`);
      process.exitCode = 1;
    } else {
      console.log(check ? 'build-bulletins: archive HTML is current' : `build-bulletins: ${written.length} page(s) updated`);
    }
  } catch (error) {
    console.error(`build-bulletins: ${error.message}`);
    process.exitCode = 1;
  }
}
