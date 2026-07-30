// Post-flatten check: load every static page in a browser, screenshot it, and report
// console errors plus any request that failed to resolve.
//
//   cp scripts/verify-pages.mjs /tmp/ukc-prerender/ && node /tmp/ukc-prerender/verify-pages.mjs

import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createReadStream } from 'node:fs';

const SITE = '/Users/derekpeterson/projects/personal/ukc-website/site';
const SHOTS = '/tmp/ukc-shots';
const PORT = 8792;

const ROUTES = [
  '', 'new', 'mass', 'about', 'sjb', 'ic', 'sjb-history', 'ic-history',
  'sacraments', 'formation', 'giving', 'watch', 'contact', 'prayer',
];

const MIME = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
  '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.webp': 'image/webp', '.json': 'application/json',
};

const server = http.createServer(async (req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(SITE, p);
  try {
    await fs.access(file);
    res.setHeader('Content-Type', MIME[path.extname(file)] ?? 'application/octet-stream');
    createReadStream(file).pipe(res);
  } catch {
    res.statusCode = 404;
    res.end('not found');
  }
});
await new Promise((r) => server.listen(PORT, r));
await fs.mkdir(SHOTS, { recursive: true });

const browser = await chromium.launch();
let problems = 0;

for (const route of ROUTES) {
  const name = route || 'home';
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('response', (r) => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });

  await page.goto(`http://localhost:${PORT}/${route ? route + '/' : ''}`, { waitUntil: 'load' });
  await page.waitForTimeout(500);

  const info = await page.evaluate(() => ({
    title: document.title,
    canonical: document.querySelector('link[rel=canonical]')?.href ?? 'MISSING',
    navLinks: [...document.querySelectorAll('a.nav__link')].map((a) => a.getAttribute('href')),
    activeNav: document.querySelector('a.nav__link.is-active')?.textContent.trim() ?? null,
    drawer: !!document.querySelector('.nav__drawer'),
    forms: document.querySelectorAll('form').length,
    // Anything still showing the runtime's own markup means cleanup missed a spot.
    residue: document.querySelectorAll('[data-dc-tpl], x-dc, .sc-host, .sc-interp').length,
    brokenLocalLinks: [...document.querySelectorAll('a[href]')]
      .map((a) => a.getAttribute('href'))
      .filter((h) => h && !/^(https?:|mailto:|tel:|#)/.test(h)),
  }));

  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });
  await page.close();

  const bad = errors.length || info.residue || info.canonical === 'MISSING';
  if (bad) problems++;
  console.log(`${bad ? 'FAIL' : ' ok '} ${name.padEnd(12)} forms=${info.forms} drawer=${info.drawer} residue=${info.residue} active=${info.activeNav}`);
  errors.forEach((e) => console.log(`       ${e}`));
}

await browser.close();
server.close();
console.log(problems ? `\n${problems} page(s) need attention` : '\nall pages clean');
