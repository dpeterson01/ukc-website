// Exercises the behavior site.js took over from React: the mobile drawer, the
// contact form's reason-driven fields, validation, and the footer signup.
//
//   cp scripts/verify-behavior.mjs /tmp/ukc-prerender/ && node /tmp/ukc-prerender/verify-behavior.mjs

import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createReadStream } from 'node:fs';

const SITE = '/Users/derekpeterson/projects/personal/church/ukc-website/site';
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

  check('contact has no registration reason',
    (await page.locator('#cf-reason option[value="register"]').count()) === 0);
  check('contact links to parish registration',
    await page.locator('a[href="../forms/parish-registration/"]').count() === 1);
  await page.screenshot({ path: path.join(SHOTS, 'contact-form.png'), fullPage: true });

  // empty submit should surface inline errors, not navigate away
  await page.selectOption('#cf-reason', 'hello');
  await page.locator('form.form button[type=submit]').click();
  await page.waitForTimeout(250);
  const errs = await page.locator('.form__error').count();
  check('empty submit shows errors', errs >= 3, `${errs} errors`);
  check('invalid submit did not navigate', page.url().endsWith('/contact/'));
  await page.close();
}

// --- /new/ locked hello form --------------------------------------------
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  await page.goto(`http://localhost:${PORT}/new/`, { waitUntil: 'load' });
  await page.waitForTimeout(300);
  check('/new/ has no reason selector', (await page.locator('#cf-reason').count()) === 0);
  check('/new/ is a hello form', await page.locator('form.form').getAttribute('data-reason') === 'hello');
  check('/new/ has no register fields', (await page.locator('#cf-parish, #cf-phone, #cf-heard-about').count()) === 0);
  await page.screenshot({ path: path.join(SHOTS, 'new-hello-form.png'), fullPage: true });
  await page.close();
}

// --- footer signup -------------------------------------------------------
for (const locale of ['en', 'es']) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 }, locale: 'en-US' });
  await page.goto(`http://localhost:${PORT}${locale === 'es' ? '/es' : ''}/mass/`, { waitUntil: 'load' });
  await page.waitForTimeout(300);

  const firstName = page.locator('.footer__signup-form input[name="first_name"]');
  const lastName = page.locator('.footer__signup-form input[name="last_name"]');
  check('the signup asks for separate first and last names',
    (await firstName.count()) === 1 && (await lastName.count()) === 1);
  check('the name fields support browser autocomplete',
    (await firstName.getAttribute('autocomplete')) === 'given-name'
    && (await lastName.getAttribute('autocomplete')) === 'family-name');

  check('the signup does not ask for scope preferences',
    (await page.locator('.footer__signup-prefs:visible, .footer__signup-parish').count()) === 0);

  const firstBox = await firstName.boundingBox();
  const lastBox = await lastName.boundingBox();
  const emailBox = await page.locator('.footer__signup-input[type="email"]').boundingBox();
  const buttonBox = await page.locator('form.footer__signup-form button[type=submit]').boundingBox();
  const copyBox = await page.locator('.footer__signup-copy').boundingBox();
  const formBox = await page.locator('.footer__signup-form').boundingBox();
  check(`${locale} desktop names share the first row`, Math.abs(firstBox.y - lastBox.y) < 1);
  check(`${locale} desktop email and button share the second row`,
    emailBox.y > firstBox.y + firstBox.height && Math.abs(emailBox.y - buttonBox.y) < 1);
  check(`${locale} desktop signup columns have balanced widths`, Math.abs(copyBox.width - formBox.width) < 2);
  check(`${locale} desktop signup columns are vertically centered`,
    Math.abs(copyBox.y + copyBox.height / 2 - formBox.y - formBox.height / 2) < 2);

  await firstName.fill('Maria');
  await lastName.fill('Santos');
  await page.locator('form.footer__signup-form button[type=submit]').click();
  await page.waitForTimeout(250);
  check('signup rejects empty email', (await page.locator('.footer__signup-form .form__error').count()) === 1);

  await page.locator('.footer__signup').screenshot({ path: path.join(SHOTS, `footer-signup-${locale}.png`) });

  let signupPayload;
  await page.route('https://forms.ukccatholic.org/contact', async (route) => {
    signupPayload = route.request().postDataJSON();
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
  });
  await page.locator('.footer__signup-input[type="email"]').fill('maria@example.com');
  await page.locator('form.footer__signup-form button[type=submit]').click();
  await page.waitForTimeout(150);
  check('first and last name are submitted separately',
    signupPayload?.fields?.['First name'] === 'Maria'
    && signupPayload?.fields?.['Last name'] === 'Santos');
  check(`${locale} signup sends page language, not browser language`,
    signupPayload?.fields?.['Preferred language'] === locale);
  check(`${locale} signup has a generic acknowledgement`,
    await page.locator('.footer__signup-thanks[role="status"]').count() === 1);
  check('the signup sends no client-controlled scope',
    !('Parish' in (signupPayload?.fields || {}))
    && !('Subscriptions' in (signupPayload?.fields || {})));
  await page.close();
}

const bulletinIssues = ['2026-08-23', '2026-09-20', '2026-08-30', '2026-09-13', '2026-09-06']
  .map((date) => ({ date, path: `/bulletins/2026/${date}-bulletin.pdf`, bytes: 110209 }));
for (const locale of ['en', 'es']) {
  const prefix = locale === 'es' ? '/es' : '';
  for (const width of [390, 1280]) {
    for (const routePath of ['/', '/watch/', '/bulletins/']) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      let requests = 0;
      await page.route('**/bulletins/index.json', (route) => {
        requests += 1;
        return route.fulfill({ json: { issues: bulletinIssues } });
      });
      await page.goto(`http://localhost:${PORT}${prefix}${routePath}`, { waitUntil: 'load' });
      const isArchive = routePath === '/bulletins/';
      const surface = page.locator(isArchive ? '[data-bulletin-archive]' : '[data-bulletin-latest]');
      await surface.locator('a[href$="2026-09-20-bulletin.pdf"]').waitFor();
      const label = `${locale} ${routePath} at ${width}px`;
      const bulletinNav = page.locator('.nav__links a[href$="bulletins/"]');
      check(`${label} keeps bulletins out of header`, await bulletinNav.count() === 0);
      check(`${label} keeps bulletins out of mobile drawer`,
        await page.locator('.nav__drawer-link[href$="bulletins/"]').count() === 0);
      const connect = page.locator('.footer__col').filter({ has: page.locator('h4', { hasText: /^(Connect|Conectar|Conéctese)$/ }) });
      check(`${label} footer keeps four links`, await connect.locator('a').count() === 4);
      check(`${label} footer bulletin link stays in its language`,
        await connect.locator('a[href$="bulletins/"]').evaluate((link) => new URL(link.href).pathname) === `${prefix}/bulletins/`);
      check(`${label} footer uses compact labels`, JSON.stringify(await connect.locator('a').allTextContents()) ===
        JSON.stringify(locale === 'es' ? ['Boletines', 'Ver Misa', 'Formularios parroquiales', 'Contacto'] : ['Bulletins', 'Watch Mass', 'Parish forms', 'Contact us']));
      if (!isArchive) check(`${label} latest includes recent archive shortcut`,
        await surface.locator('.bulletin-latest__recent').getAttribute('href') === `${prefix}/bulletins/`);
      check(`${label} shows ${isArchive ? 'four' : 'one'} issues`,
        await surface.locator('a[href$="-bulletin.pdf"]').count() === (isArchive ? 4 : 1));
      check(`${label} selects newest first`,
        await surface.locator('a').first().getAttribute('href') === '/bulletins/2026/2026-09-20-bulletin.pdf');
      check(`${label} fetches the shared index once`, requests === 1);
      check(`${label} has no horizontal overflow`, await page.evaluate(() =>
        document.documentElement.scrollWidth <= window.innerWidth));
      if (locale === 'es') check(`${label} identifies the English PDF`,
        (await surface.innerText()).includes('PDF en inglés'));
      await page.addStyleTag({ content: '.nav { position: static !important; }' });
      await surface.screenshot({ path: path.join(SHOTS, `bulletin-${locale}-${isArchive ? 'archive' : routePath === '/' ? 'home' : 'watch'}-${width}.png`) });
      await page.close();
    }
  }
  for (const failure of [false, true]) {
    const page = await browser.newPage();
    await page.route('**/bulletins/index.json', (route) => route.fulfill({
      status: failure ? 503 : 200, json: { issues: [] },
    }));
    await page.goto(`http://localhost:${PORT}${prefix}/`);
    check(`${locale} latest fallback survives ${failure ? 'failure' : 'empty archive'}`,
      await page.locator('[data-bulletin-latest] a').getAttribute('href') === 'bulletins/');
    await page.goto(`http://localhost:${PORT}${prefix}/bulletins/`);
    await page.waitForFunction(() => !/Loading|Cargando/.test(document.querySelector('[data-bulletin-archive]').textContent));
    check(`${locale} archive has a ${failure ? 'failure' : 'empty'} status`,
      await page.locator('[data-bulletin-archive] [role="status"]').count() === 1);
    await page.close();
  }
  const noScript = await browser.newPage({ javaScriptEnabled: false });
  for (const routePath of ['/', '/watch/']) {
    await noScript.goto(`http://localhost:${PORT}${prefix}${routePath}`);
    check(`${locale} ${routePath} no-JS fallback links to bulletins`,
      /bulletins\/$/.test(await noScript.locator('[data-bulletin-latest] a').getAttribute('href')));
  }
  await noScript.close();
}

for (const locale of ['en', 'es']) {
  for (const width of [390, 640, 768, 960, 1024, 1181, 1280, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } });
    const prefix = locale === 'es' ? '/es' : '';
    await page.goto(`http://localhost:${PORT}${prefix}/`, { waitUntil: 'load' });
    await page.locator('.footer__signup-fields').waitFor();
    const label = `${locale} homepage at ${width}px`;
    check(`${label} fits horizontally`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    if (await page.locator('.nav__links').isVisible()) {
      const logo = await page.locator('.nav__logo').boundingBox();
      const links = await page.locator('.nav__links').boundingBox();
      check(`${label} navigation does not overlap logo`, logo.x + logo.width <= links.x);
      check(`${label} navigation fits viewport`, links.x + links.width <= width);
    } else {
      await page.locator('.nav__toggle').click();
      check(`${label} drawer has no extra bulletin item`, await page.locator('.nav__drawer-link[href$="bulletins/"]').count() === 0);
      await page.keyboard.press('Escape');
    }
    const fields = await page.locator('.footer__signup-fields').boundingBox();
    check(`${label} signup controls fit their grid`, await page.locator('.footer__signup-fields input, .footer__signup-fields button')
      .evaluateAll((controls, bounds) => controls.every((control) => {
        const rect = control.getBoundingClientRect();
        return rect.left >= bounds.x - 1 && rect.right <= bounds.x + bounds.width + 1 && control.scrollWidth <= control.clientWidth + 1;
      }), fields));
    await page.addStyleTag({ content: '.nav { position: static !important; }' });
    if ([390, 1280].includes(width)) {
      await page.locator('.footer__signup').screenshot({ path: path.join(SHOTS, `footer-balanced-${locale}-${width}.png`) });
      await page.locator('.footer__inner').screenshot({ path: path.join(SHOTS, `footer-links-${locale}-${width}.png`) });
      await page.locator('.nav__inner').screenshot({ path: path.join(SHOTS, `nav-bulletins-${locale}-${width}.png`) });
    }
    await page.close();
  }
  for (const width of [390, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } });
    await page.goto(`http://localhost:${PORT}${locale === 'es' ? '/es' : ''}/email/`, { waitUntil: 'load' });
    check(`${locale} dedicated signup at ${width}px fits`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.locator('.footer__signup').screenshot({ path: path.join(SHOTS, `signup-page-${locale}-${width}.png`) });
    await page.close();
  }
}

await browser.close();
server.close();
const failed = results.filter((r) => !r.pass).length;
console.log(failed ? `\n${failed} check(s) failed` : '\nall behavior checks passed');
process.exitCode = failed ? 1 : 0;
