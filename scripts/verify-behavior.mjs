// Exercises the behavior site.js took over from React: the mobile drawer, the
// contact form's reason-driven fields, validation, and the footer signup.
//
//   cp scripts/verify-behavior.mjs /tmp/ukc-prerender/ && node /tmp/ukc-prerender/verify-behavior.mjs

import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createReadStream } from 'node:fs';

const SITE = '/Users/derekpeterson/projects/personal/ukc-website/site';
const SHOTS = '/tmp/ukc-shots';
const PORT = 8793;
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
  } catch { res.statusCode = 404; res.end('not found'); }
});
await new Promise((r) => server.listen(PORT, r));
await fs.mkdir(SHOTS, { recursive: true });

const browser = await chromium.launch();
const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  console.log(`${pass ? ' ok ' : 'FAIL'} ${name}${detail ? '  ' + detail : ''}`);
};

// --- mobile drawer -------------------------------------------------------
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
  await page.waitForTimeout(300);

  const hiddenAtRest = await page.locator('.nav__drawer').isHidden();
  check('drawer hidden at rest', hiddenAtRest);

  await page.locator('.nav__toggle, [aria-controls="nav-drawer"]').first().click();
  await page.waitForTimeout(250);
  check('drawer opens on toggle', await page.locator('.nav__drawer').isVisible());
  check('drawer has links', (await page.locator('.nav__drawer-link').count()) > 0,
    `${await page.locator('.nav__drawer-link').count()} links`);
  await page.screenshot({ path: path.join(SHOTS, 'mobile-drawer.png') });

  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  check('Escape closes drawer', await page.locator('.nav__drawer').isHidden());
  await page.close();
}

// --- contact form conditional fields ------------------------------------
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  await page.goto(`http://localhost:${PORT}/contact/`, { waitUntil: 'load' });
  await page.waitForTimeout(300);

  const expected = {
    hello: [], other: [],
    register: ['#cf-parish', '#cf-phone', '#cf-heard-about'],
    prayer: ['#cf-prayer-for', '#cf-requester-contact'],
    sacrament: ['#cf-sacrament', '#cf-timeframe'],
  };
  for (const [reason, ids] of Object.entries(expected)) {
    await page.selectOption('#cf-reason', reason);
    await page.waitForTimeout(150);
    const found = await page.evaluate((ids) => ids.filter((i) => document.querySelector(i)), ids);
    const extras = await page.locator('.form__conditional *').count();
    check(`reason "${reason}" fields`,
      found.length === ids.length && (ids.length > 0 || extras === 0),
      ids.length ? found.join(' ') : 'no extra fields');
  }

  await page.selectOption('#cf-reason', 'register');
  await page.waitForTimeout(150);
  await page.screenshot({ path: path.join(SHOTS, 'contact-register-fields.png'), fullPage: true });

  // chips should toggle their checked state and their styling
  const chip = page.locator('.form__conditional label:has(input[type=checkbox])').first();
  if (await chip.count()) {
    const before = await chip.evaluate((el) => el.querySelector('input')?.checked);
    await chip.click();
    await page.waitForTimeout(100);
    const after = await chip.evaluate((el) => el.querySelector('input')?.checked);
    check('conditional chip toggles', before !== after);
  }

  // empty submit should surface inline errors, not navigate away
  await page.selectOption('#cf-reason', 'hello');
  await page.locator('form.form button[type=submit]').click();
  await page.waitForTimeout(250);
  const errs = await page.locator('.form__error').count();
  check('empty submit shows errors', errs >= 3, `${errs} errors`);
  check('invalid submit did not navigate', page.url().endsWith('/contact/'));
  await page.close();
}

// --- /new/ locked register form -----------------------------------------
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  await page.goto(`http://localhost:${PORT}/new/`, { waitUntil: 'load' });
  await page.waitForTimeout(300);
  check('/new/ has no reason selector', (await page.locator('#cf-reason').count()) === 0);
  check('/new/ prerenders register fields', (await page.locator('#cf-parish').count()) === 1);
  await page.close();
}

// --- footer signup -------------------------------------------------------
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  await page.goto(`http://localhost:${PORT}/mass/`, { waitUntil: 'load' });
  await page.waitForTimeout(300);
  await page.locator('form.footer__signup-form button[type=submit]').click();
  await page.waitForTimeout(250);
  check('signup rejects empty email', (await page.locator('.footer__signup-form .form__error').count()) === 1);
  await page.close();
}

await browser.close();
server.close();
const failed = results.filter((r) => !r.pass).length;
console.log(failed ? `\n${failed} check(s) failed` : '\nall behavior checks passed');
