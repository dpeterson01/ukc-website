/* Checks the notice bar's data file before it reaches the site.
 *
 * The bar is chrome on every page, so a malformed entry is visible everywhere
 * at once, and the person editing it is not necessarily the person who wrote
 * the rules in its header comment. Runs on plain Node, no dependencies:
 *
 *   node scripts/verify-announcements.mjs
 */
import { readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FILE = join(ROOT, 'site', 'assets', 'announcements.js');

const LIMITS = {
  en: { label: 40, text: 100, cta: 24 },
  es: { label: 50, text: 125, cta: 30 },
};
const LANGS = Object.keys(LIMITS);
const ENTRY_KEYS = new Set(['id', 'start', 'end', ...LANGS]);
const COPY_KEYS = new Set(['label', 'text', 'cta']);
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const SAFE_HREF = /^(https:\/\/|\.\.?\/|\/)/;

const failures = [];
const notes = [];
const fail = (where, message) => failures.push(`${where}: ${message}`);

const source = readFileSync(FILE, 'utf8');

/* The file is a script rather than JSON so the parish can keep the instructions
   next to the data, so read it the way the browser does: hand it a `window`. */
const root = {};
new Function('window', `${source}\nreturn window;`)(root);
const list = root.UKC_ANNOUNCEMENTS;

if (!Array.isArray(list)) {
  console.error('announcements.js: UKC_ANNOUNCEMENTS is not an array');
  process.exit(1);
}

const seenIds = new Set();

list.forEach((entry, i) => {
  const where = `entry ${i + 1}`;

  for (const key of Object.keys(entry)) {
    if (!ENTRY_KEYS.has(key)) fail(where, `unknown key "${key}"`);
  }

  if (typeof entry.id !== 'string' || !entry.id.trim()) fail(where, 'id is missing');
  else if (seenIds.has(entry.id)) fail(where, `id "${entry.id}" is already used`);
  else seenIds.add(entry.id);

  for (const key of ['start', 'end']) {
    if (!ISO.test(entry[key] || '')) fail(where, `${key} must be YYYY-MM-DD`);
  }
  if (ISO.test(entry.start || '') && ISO.test(entry.end || '') && entry.end < entry.start) {
    fail(where, `end (${entry.end}) is before start (${entry.start})`);
  }

  for (const lang of LANGS) {
    const copy = entry[lang];
    const limits = LIMITS[lang];
    const at = `${where} [${lang}]`;

    if (!copy || typeof copy !== 'object') {
      fail(at, 'is missing; both languages are required');
      continue;
    }
    for (const key of Object.keys(copy)) {
      if (!COPY_KEYS.has(key)) fail(at, `unknown key "${key}"`);
    }

    for (const key of ['label', 'text']) {
      const value = copy[key];
      if (typeof value !== 'string' || !value.trim()) {
        fail(at, `${key} is missing`);
      } else if (value.length > limits[key]) {
        fail(at, `${key} is ${value.length - limits[key]} characters over the ${limits[key]} limit`);
      }
    }

    if (copy.cta) {
      if (typeof copy.cta.text !== 'string' || !copy.cta.text.trim()) {
        fail(at, 'cta has no text');
      } else if (copy.cta.text.length > limits.cta) {
        fail(at, `cta text is ${copy.cta.text.length - limits.cta} characters over the ${limits.cta} limit`);
      }
      // Matches the allowlist in site.js, which silently drops anything else.
      if (!SAFE_HREF.test(copy.cta.href || '')) {
        fail(at, `cta href "${copy.cta.href}" must start with /, ./, ../ or https://`);
      }
    }

    for (const key of ['label', 'text']) {
      if (typeof copy[key] === 'string' && copy[key].includes('\u2014')) {
        fail(at, `${key} uses an em dash, which is against house style`);
      }
    }
  }
});

const now = new Date();
const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
const active = list.filter((e) => e.start <= today && today <= e.end);
notes.push(`${list.length} notice(s) defined`);
notes.push(active.length
  ? `showing today (${today}): ${active[0].id}${active.length > 1 ? ` (${active.length - 1} also active, ignored)` : ''}`
  : `showing today (${today}): none`);

console.log(notes.map((n) => `  ${n}`).join('\n'));
if (failures.length) {
  console.error(`\n${failures.length} problem(s):`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('\nverify-announcements: OK');
