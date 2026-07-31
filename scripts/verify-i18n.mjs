/* Checks the two language trees stay in step.
 *
 * Runs on plain Node with no dependencies, unlike verify-pages.mjs which needs
 * Playwright. Run it after editing any page:
 *
 *   node scripts/verify-i18n.mjs
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = join(ROOT, 'site');
const BASE = 'https://dpeterson01.github.io/ukc-website/';

const failures = [];
const notes = [];
const noindexed = new Set();
const fail = (page, message) => failures.push(`${page}: ${message}`);

/* Page ids are the URL path relative to their tree, so '' is the tree's home. */
function findPages(dir, prefix = '') {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (entry === 'es' && prefix === '') continue;
    if (entry.startsWith('_') || entry === 'assets') continue;
    const full = join(dir, entry);
    if (!statSync(full).isDirectory()) continue;
    if (existsSync(join(full, 'index.html'))) out.push(`${prefix}${entry}/`);
    out.push(...findPages(full, `${prefix}${entry}/`));
  }
  return out;
}

const enPages = ['', ...findPages(SITE)].sort();
const esPages = ['', ...findPages(join(SITE, 'es'))].sort();

if (enPages.join('|') !== esPages.join('|')) {
  const missing = enPages.filter((p) => !esPages.includes(p));
  const extra = esPages.filter((p) => !enPages.includes(p));
  if (missing.length) fail('es/', `no Spanish counterpart for: ${missing.join(', ')}`);
  if (extra.length) fail('es/', `Spanish page with no English original: ${extra.join(', ')}`);
}

const attr = (html, re) => (html.match(re) || [])[1] || null;

function checkPage(page, lang) {
  const id = lang === 'es' ? `es/${page}` : page || '(home)';
  const file = join(SITE, lang === 'es' ? 'es' : '', page, 'index.html');
  if (!existsSync(file)) return fail(id, 'index.html is missing');
  const html = readFileSync(file, 'utf8');

  const declared = attr(html, /<html lang="([^"]+)"/);
  if (declared !== lang) fail(id, `<html lang> is "${declared}", expected "${lang}"`);

  const selfUrl = `${BASE}${lang === 'es' ? 'es/' : ''}${page}`;
  const canonical = attr(html, /<link rel="canonical" href="([^"]+)"/);
  if (canonical !== selfUrl) fail(id, `canonical is "${canonical}", expected "${selfUrl}"`);

  const expected = {
    en: `${BASE}${page}`,
    es: `${BASE}es/${page}`,
    'x-default': `${BASE}${page}`,
  };
  for (const [code, href] of Object.entries(expected)) {
    const found = attr(html, new RegExp(`hreflang="${code}" href="([^"]+)"`));
    if (found !== href) fail(id, `hreflang="${code}" is "${found}", expected "${href}"`);
  }

  const toggleHref = attr(html, /<a class="utility-bar__lang" href="([^"]+)"/);
  if (!toggleHref) {
    fail(id, 'no language toggle in the utility bar');
  } else {
    const landsOn = relative(SITE, resolve(dirname(file), toggleHref));
    const wanted = lang === 'es' ? page.replace(/\/$/, '') : join('es', page).replace(/\/$/, '');
    if (landsOn !== wanted) fail(id, `toggle href "${toggleHref}" lands on "${landsOn}", expected "${wanted}"`);
  }

  const stringsAt = html.indexOf('assets/strings.js');
  const siteAt = html.indexOf('assets/site.js');
  if (stringsAt < 0) fail(id, 'strings.js is not loaded');
  else if (siteAt >= 0 && stringsAt > siteAt) fail(id, 'strings.js must load before site.js');

  const chips = html.match(/<label class="chip(?: is-on)?" data-en="[^"]+"/g) || [];
  if (chips.length !== 3) fail(id, `expected 3 footer chips with data-en, found ${chips.length}`);

  /* Relative asset references have to resolve, since the Spanish tree sits one
     level deeper and every ../ had to be adjusted. */
  for (const [, ref] of html.matchAll(/(?:src|href)="((?:\.\.\/)*(?:assets|_ds|forms\/engine|forms\/schemas|forms\/blocks)\/[^"]+)"/g)) {
    if (!existsSync(resolve(dirname(file), ref))) fail(id, `asset does not resolve: ${ref}`);
  }

  const pending = html.includes('TRANSLATION PENDING');
  const noindex = /<meta name="robots" content="noindex">/.test(html);
  if (noindex) noindexed.add(`${lang}:${page}`);

  /* English is the source language, so it can never be awaiting translation. It
     can still be held back from search, which is how an unlaunched page like the
     registration form is published without inviting traffic to it. */
  if (lang === 'en' && pending) fail(id, 'English is the source language and cannot be marked pending');
  if (lang === 'es' && pending !== noindex) {
    fail(id, 'the TRANSLATION PENDING marker and the noindex meta must be added and removed together');
  }
  return pending;
}

for (const page of enPages) checkPage(page, 'en');
const stillEnglish = esPages.filter((page) => checkPage(page, 'es'));

/* Holding a page back from search only works if both languages are held back.
   The reverse is normal: a pending Spanish page is noindex while English is live. */
for (const page of enPages) {
  if (!esPages.includes(page)) continue;
  if (noindexed.has(`en:${page}`) && !noindexed.has(`es:${page}`)) {
    fail(page || '/', 'English is noindex but its Spanish counterpart is not');
  }
}

/* Chrome is duplicated by hand across every page, so drift is the likely bug. */
function chromeParity(pages, lang) {
  const shapes = new Map();
  for (const page of pages) {
    const file = join(SITE, lang === 'es' ? 'es' : '', page, 'index.html');
    if (!existsSync(file)) continue;
    const html = readFileSync(file, 'utf8');
    const nav = (html.match(/<nav class="nav__links">([\s\S]*?)<\/nav>/) || [])[1] || '';
    const times = (html.match(/<div class="utility-bar__times">([\s\S]*?)<\/div>\s*<div class="utility-bar__contact">/) || [])[1] || '';
    const shape = (nav + times)
      .replace(/ is-active/g, '')
      .replace(/(?:\.\.\/)+/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!shapes.has(shape)) shapes.set(shape, []);
    shapes.get(shape).push(page || '(home)');
  }
  if (shapes.size > 1) {
    const groups = [...shapes.values()].sort((a, b) => b.length - a.length);
    fail(`${lang} chrome`, `nav or utility bar has drifted. Majority: ${groups[0].length} pages. Odd ones out: ${groups.slice(1).map((g) => g.join(', ')).join(' | ')}`);
  }
}
chromeParity(enPages, 'en');
chromeParity(esPages, 'es');

const strings = readFileSync(join(SITE, 'assets', 'strings.js'), 'utf8');
const esBlock = (strings.match(/var ES = \{([\s\S]*?)\n  \};/) || [])[1] || '';
const enBlock = (strings.match(/var EN = \{([\s\S]*?)\n  \};/) || [])[1] || '';
const keys = (block) => new Set([...block.matchAll(/^\s*'([^']+)':/gm)].map((m) => m[1]));
const enKeys = keys(enBlock);
const esKeys = keys(esBlock);
for (const key of enKeys) if (!esKeys.has(key)) fail('strings.js', `es is missing key "${key}"`);
for (const key of esKeys) if (!enKeys.has(key)) fail('strings.js', `es has key "${key}" that en does not`);
const untranslated = [...esBlock.matchAll(/^\s*'([^']+)': '',$/gm)].length;

notes.push(`${enPages.length} pages per tree`);
notes.push(`pages still awaiting Spanish copy: ${stillEnglish.length}/${esPages.length}`);
notes.push(`untranslated strings.js keys: ${untranslated}/${enKeys.size}`);

console.log(notes.map((n) => `  ${n}`).join('\n'));
if (failures.length) {
  console.error(`\n${failures.length} problem(s):`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('\nverify-i18n: OK');
