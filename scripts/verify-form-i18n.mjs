/* Checks the form engine actually speaks Spanish.
 *
 * Two things can silently go wrong: the translation file is never fetched, or
 * it is fetched and quietly ignored. Both look identical to a static check, so
 * this loads the real pages in a browser and reads what a person would see.
 */

import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createReadStream } from 'node:fs';

const SITE = '/Users/derekpeterson/projects/personal/ukc-website/site';
const PORT = 8799;
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png' };

const server = http.createServer(async (req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(SITE, p);
  try {
    await fs.access(file);
    res.setHeader('Content-Type', MIME[path.extname(file)] ?? 'application/octet-stream');
    createReadStream(file).pipe(res);
  } catch { res.statusCode = 404; res.end('not found'); }
});
await new Promise((r) => server.listen(PORT, r));

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass });
  console.log(`${pass ? 'ok  ' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1100, height: 1000 } });
const problems = [];
page.on('console', (m) => { if (m.type() === 'error') problems.push(m.text()); });
page.on('response', (r) => {
  // A missing translation file is meant to be survivable, so it is not a failure
  // here, but every other 404 is.
  if (r.status() >= 400 && !/i18n\//.test(r.url())) problems.push(`${r.status()} ${r.url()}`);
});

const load = async (url) => {
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForSelector('.ukcf-form', { timeout: 5000 });
  await page.waitForTimeout(200);
};

const visibleStep = () => page.locator('.ukcf-step:not([hidden])').first();

// --- English is untouched ------------------------------------------------
await load(`http://localhost:${PORT}/forms/parish-registration/`);
check('the English form still loads', await page.locator('.ukcf-form').isVisible());
const enTitle = (await visibleStep().locator('.ukcf-step-title').innerText()).trim();
check('the English step title is English', enTitle === 'Getting started', enTitle);
const enBtn = (await page.locator('.ukcf-btn--primary').first().innerText()).trim();
check('the English button is English', enBtn === 'Continue', enBtn);

// --- Spanish -------------------------------------------------------------
await load(`http://localhost:${PORT}/es/forms/parish-registration/`);
check('the Spanish form loads', await page.locator('.ukcf-form').isVisible());

const esTitle = (await visibleStep().locator('.ukcf-step-title').innerText()).trim();
check('a translated step title is in Spanish', esTitle === 'Para empezar', esTitle);

const esBtn = (await page.locator('.ukcf-btn--primary').first().innerText()).trim();
check('the engine chrome is in Spanish', esBtn === 'Continuar', esBtn);

const langAttr = await page.locator('[data-ukc-form]').getAttribute('data-lang');
check('the mount carries the language', langAttr === 'es', langAttr);

// Every string is translated now, so the fallback cannot be proven by finding an
// untranslated one. Ask the translator directly for a key that does not exist.
const fallback = await page.evaluate(() => {
  const t = window.ukcFormEngine.t;
  return {
    missingKey: t.content_('step.does-not-exist.title', 'Readable English'),
    missingChrome: t.t('no.such.key'),
    realChrome: t.t('btn.continue'),
  };
});
check('a key with no translation falls back to readable English',
  fallback.missingKey === 'Readable English', fallback.missingKey);
check('a chrome key that does not exist returns nothing rather than its own name',
  fallback.missingChrome === '', JSON.stringify(fallback.missingChrome));
check('a chrome key that does exist is Spanish',
  fallback.realChrome === 'Continuar', fallback.realChrome);

// Nothing English should be showing on a Spanish page now that the files are full.
const esBody = await visibleStep().innerText();
check('no English leaks into the visible Spanish step',
  !/\b(Getting started|Continue|First name|Date of birth|Yes|No thanks)\b/.test(esBody),
  esBody.split('\n').slice(0, 3).join(' / '));

// --- every form, in Spanish ----------------------------------------------
for (const [slug, expected] of [
  ['ocia-sponsor', 'Lo que hace un padrino o madrina'],
  ['faith-formation', 'Para empezar'],
  ['ocia-participant', 'Para empezar'],
]) {
  await load(`http://localhost:${PORT}/es/forms/${slug}/`);
  const title = (await visibleStep().locator('.ukcf-step-title').innerText()).trim();
  check(`es/${slug} opens in Spanish`, title === expected, title);
}

check('no console errors', problems.length === 0, problems.slice(0, 3).join(' | '));

await browser.close();
server.close();

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
