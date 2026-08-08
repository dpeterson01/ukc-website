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

// The whole point of falling back: an untranslated field stays readable. This
// picks a step deliberately left out of the Spanish file, so it proves the
// fallback rather than accidentally reading a translated string.
const fallback = await page.evaluate(() => {
  const e = window.ukcFormEngine;
  const step = e.schema.steps.find((s) => s.id === 'head-sacraments');
  return step ? step.title : null;
});
check('an untranslated string falls back to readable English',
  fallback === 'Sacramental record', fallback);

// --- an entirely missing translation file --------------------------------
await load(`http://localhost:${PORT}/es/forms/ocia-sponsor/`);
check('a form with no Spanish yet still renders', await page.locator('.ukcf-form').isVisible());
const fallbackTitle = (await visibleStep().locator('.ukcf-step-title').innerText()).trim();
check('and shows readable English rather than key names',
  fallbackTitle.length > 3 && !fallbackTitle.includes('.'), fallbackTitle);

check('no console errors', problems.length === 0, problems.slice(0, 3).join(' | '));

await browser.close();
server.close();

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
