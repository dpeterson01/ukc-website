// Walks the parish registration form the way a person would: answers the gates,
// adds and removes a child, signs, and tries to submit while things are missing.
//
// Static checks miss the bugs that matter here, so this also writes a screenshot
// of every step to /tmp/ukc-shots/forms. Look at them.
//
//   cp scripts/verify-forms.mjs /tmp/ukc-prerender/ && node /tmp/ukc-prerender/verify-forms.mjs

import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createReadStream, existsSync } from 'node:fs';

const SITE = '/Users/derekpeterson/projects/personal/ukc-website/site';
const SHOTS = '/tmp/ukc-shots/forms';
const FIXTURE = '/Users/derekpeterson/projects/personal/ukc-website/worker/test/fixture.json';
const PORT = 8795;
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
await fs.rm(SHOTS, { recursive: true, force: true });
await fs.mkdir(SHOTS, { recursive: true });

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  console.log(`${pass ? ' ok ' : 'FAIL'} ${name}${detail ? '  ' + detail : ''}`);
};

// A crash partway through is still useful information, so report what ran
// before letting the process die.
const report = () => {
  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  console.log(`screenshots in ${SHOTS}`);
  return failed.length;
};
process.on('uncaughtException', (err) => {
  console.log(`\nCRASHED: ${err && err.message ? err.message.split('\n')[0] : err}`);
  report();
  process.exit(1);
});

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1100, height: 1000 } });
page.setDefaultTimeout(8000);

const consoleErrors = [];
const badResponses = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push(String(e)));
page.on('response', (r) => { if (r.status() >= 400) badResponses.push(`${r.status()} ${r.url()}`); });

let shotIndex = 0;
// Inputs fade their border colour over 120ms. Screenshotting inside that window
// catches a half-faded error red and makes a correct form look broken.
const settle = () => page.waitForTimeout(200);

const shot = async (name) => {
  shotIndex += 1;
  await settle();
  await page.screenshot({
    path: path.join(SHOTS, `${String(shotIndex).padStart(2, '0')}-${name}.png`),
    fullPage: true,
  });
};

const stepTitle = () => page.locator('.ukcf-step:not([hidden]) .ukcf-step-title').first().innerText();
const next = async () => {
  await page.locator('.ukcf-btn--primary').click();
  await page.waitForTimeout(250);
};
const setDate = async (base, m, d, y) => {
  await page.locator(`#${base}-month`).fill(m);
  await page.locator(`#${base}-day`).fill(d);
  await page.locator(`#${base}-year`).fill(y);
};
const radio = (name, value) => page.locator(`input[name="${name}"][value="${value}"]`);
// Plain clicks, so a mismatch shows up as a failed check instead of killing the
// run the way Playwright's own check/uncheck assertion does. A checkbox that
// refuses to flip almost always means the layout moved between mousedown and
// mouseup, so the trace records where the box sat at each point.
const toggle = async (selector, want) => {
  await page.evaluate((sel) => {
    const box = document.querySelector(sel);
    window.__toggleTrace = [];
    const at = (label) => window.__toggleTrace.push(
      `${label} top=${Math.round(box.getBoundingClientRect().top)} checked=${box.checked}`);
    box.addEventListener('mousedown', () => at('mousedown'), { once: true });
    document.addEventListener('click', (e) => at(`click on ${e.target.id || e.target.tagName}`), { once: true });
  }, selector);
  if ((await page.locator(selector).isChecked()) !== want) await page.locator(selector).click();
  await page.waitForTimeout(150);
  const got = await page.locator(selector).isChecked();
  if (got !== want) {
    console.log('     toggle trace:', JSON.stringify(await page.evaluate(() => window.__toggleTrace)));
  }
  return got === want;
};

// --- the picker page -----------------------------------------------------
await page.goto(`http://localhost:${PORT}/forms/`, { waitUntil: 'load' });
check('picker page keeps registration unlinked while the endpoint is dead',
  (await page.locator('a[href="./parish-registration/"]').count()) === 0);
check('picker page still shows all four form cards',
  (await page.locator('.contact-card').count()) === 4);
await shot('picker');

// --- the form loads ------------------------------------------------------
await page.goto(`http://localhost:${PORT}/forms/parish-registration/`, { waitUntil: 'load' });
await page.waitForSelector('.ukcf-form', { timeout: 5000 });
check('form renders', await page.locator('.ukcf-form').isVisible());
check('progress shows a step count', /step 1 of \d+/i.test(await page.locator('.ukcf-progress-text').innerText()),
  await page.locator('.ukcf-progress-text').innerText());
await shot('step1-empty');

// --- empty submit is refused --------------------------------------------
await next();
check('empty step blocks and explains',
  await page.locator('.ukcf-summary').isVisible(),
  (await page.locator('.ukcf-summary h3').innerText().catch(() => '')).trim());
check('still on step 1', (await stepTitle()).includes('Getting started'));
await shot('step1-errors');

// --- step 1 --------------------------------------------------------------
await radio('f-intent', 'new').check();
await radio('f-parish', 'sjb').check();
await page.waitForTimeout(200);
check('answering the questions takes the warning away',
  await page.locator('.ukcf-summary').isHidden());
await next();
check('advanced to head of household', (await stepTitle()).includes('Head of household'), await stepTitle());

// --- step 2: head --------------------------------------------------------
await page.locator('#f-head-first').fill('Mary');
await page.locator('#f-head-last').fill('Kowalski');
await setDate('f-head-birthdate', '4', '2', '1979');
await page.locator('#f-head-birthplace').fill('Yakima, WA');
await shot('step2-head');
await next();
check('advanced to sacramental record', (await stepTitle()).includes('Sacramental record'), await stepTitle());

// --- step 3: sacraments, and the out-of-order warning --------------------
await radio('f-head-baptism-received', 'yes').check();
await radio('f-head-baptism-tradition', 'catholic').check();
await setDate('f-head-baptism-date', '6', '10', '1979');
await radio('f-head-eucharist-received', 'yes').check();
await setDate('f-head-eucharist-date', '5', '1', '1988');
await radio('f-head-confirmation-received', 'yes').check();
await setDate('f-head-confirmation-date', '3', '1', '1986');
await radio('f-head-marriage-received', 'no').check();
await page.waitForTimeout(200);
check('sacrament fields appear only after "yes"',
  await page.locator('#f-head-marriage-date-month').isHidden());

// Only baptism asks which tradition, because it is the one that is recognised
// across churches and never repeated.
check('baptism asks which tradition it was in',
  await radio('f-head-baptism-tradition', 'catholic').isVisible());
check('confirmation does not ask about tradition',
  (await radio('f-head-confirmation-tradition', 'catholic').count()) === 0);
check('the denomination box stays hidden for a Catholic baptism',
  await page.locator('#f-head-baptism-traditionName').isHidden());

check('country defaults to the United States',
  (await page.locator('#f-head-baptism-country').inputValue()) === 'United States',
  await page.locator('#f-head-baptism-country').inputValue());

await shot('step3-sacraments');

await next();
check('out-of-order confirmation warns but does not block',
  !(await stepTitle()).includes('Sacramental record'), await stepTitle());

// --- step 4: contact -----------------------------------------------------
check('advanced to contact step', (await stepTitle()).includes('How we reach you'), await stepTitle());
check('home address defaults to the mailing address',
  await page.locator('#f-home-sameAs').isChecked());
check('home address fields are collapsed', await page.locator('#f-home-street').isHidden());

await next();
check('a household with no contact method is refused', await page.locator('.ukcf-summary').isVisible());

await page.locator('#f-email').fill('mary@gmial.com');
await page.locator('#f-email').blur();
await page.waitForTimeout(200);
const typoMsg = await page.locator('#f-email-msg').innerText();
check('email typo is suggested, not rejected', /gmail\.com/.test(typoMsg), typoMsg.trim());

await page.locator('#f-email').fill('mary@example.com');
await page.locator('#f-primaryPhone').fill('5096742531');
await page.waitForTimeout(150);
check('phone formats as you type',
  (await page.locator('#f-primaryPhone').inputValue()) === '(509) 674-2531',
  await page.locator('#f-primaryPhone').inputValue());

await page.locator('#f-mailing-street').fill('PO Box 630');
await page.locator('#f-mailing-city').fill('Cle Elum');
await page.locator('#f-mailing-state').selectOption('WA');
await page.locator('#f-mailing-zip').fill('98922');
check('the "same as" box can be turned off', await toggle('#f-home-sameAs', false));
check('unchecking "same as" reveals the home address', await page.locator('#f-home-street').isVisible());
await toggle('#f-home-sameAs', true);
await shot('step4-contact');
await next();

// --- step 5: spouse gate -------------------------------------------------
check('advanced to spouse step', (await stepTitle()).includes('Spouse'), await stepTitle());
check('nothing about a spouse is asked yet', await page.locator('#f-spouse-first').isHidden());
await radio('f-hasSpouse', 'no').check();
await page.waitForTimeout(200);
await shot('step5-spouse-no');
await next();
check('answering "no" skips the spouse sacrament step',
  (await stepTitle()).includes('Children'), await stepTitle());

// --- back up and say yes, to prove the skipped step comes back -----------
await page.locator('.ukcf-actions .ukcf-btn--ghost').click();
await page.waitForTimeout(250);
await radio('f-hasSpouse', 'yes').check();
await page.waitForTimeout(250);
check('answering "yes" reveals the spouse fields', await page.locator('#f-spouse-first').isVisible());
check('the second adult is called a spouse, never a wife',
  !(await page.locator('.ukcf-step:not([hidden])').innerText()).toLowerCase().includes('wife'));
check('maiden name is offered for the spouse', await page.locator('#f-spouse-maiden').isVisible());
await page.locator('#f-spouse-first').fill('Tomasz');
await page.locator('#f-spouse-last').fill('Kowalski');
await setDate('f-spouse-birthdate', '11', '9', '1977');
await shot('step5-spouse-yes');
await next();
check('the spouse sacrament step reappears', (await stepTitle()).includes('Their sacramental record'), await stepTitle());
await radio('f-spouse-baptism-received', 'unsure').check();
await radio('f-spouse-eucharist-received', 'no').check();
await radio('f-spouse-confirmation-received', 'no').check();
await radio('f-spouse-marriage-received', 'no').check();
await next();

// --- step 7: children ----------------------------------------------------
check('advanced to children', (await stepTitle()).includes('Children'), await stepTitle());
check('no child fields until the gate is answered', await page.locator('.ukcf-repeat').isHidden());
await radio('f-hasChildren', 'yes').check();
await page.waitForTimeout(250);
check('one child appears by default', (await page.locator('.ukcf-repeat-item').count()) === 1);

await page.locator('#f-children-0-first').fill('Zofia');
await page.locator('#f-children-0-last').fill('Kowalski');
await setDate('f-children-0-birthdate', '8', '14', '2016');
await radio('f-children-0-baptism-received', 'yes').check();
await radio('f-children-0-baptism-tradition', 'other').check();
await page.waitForTimeout(200);
check('naming the denomination is asked only when the baptism was elsewhere',
  await page.locator('#f-children-0-baptism-traditionName').isVisible());
await page.locator('#f-children-0-baptism-traditionName').fill('Lutheran');
await page.locator('#f-children-0-baptism-country').fill('Mexico');
// Year only, which is how most people remember a sacrament from decades back.
// This used to validate and then get dropped on submit.
await page.locator('#f-children-0-baptism-date-year').fill('2016');
check('the optional date boxes say they are optional',
  /optional/i.test(await page.locator('label[for="f-children-0-baptism-date-month"]').innerText()),
  await page.locator('label[for="f-children-0-baptism-date-month"]').innerText());
await radio('f-children-0-eucharist-received', 'no').check();
await radio('f-children-0-confirmation-received', 'no').check();

await page.locator('.ukcf-repeat-add').click();
await page.waitForTimeout(250);
check('a second child can be added', (await page.locator('.ukcf-repeat-item').count()) === 2);
await page.locator('#f-children-1-first').fill('Jan');
await page.locator('#f-children-1-last').fill('Kowalski');
await setDate('f-children-1-birthdate', '1', '22', '2020');
await radio('f-children-1-baptism-received', 'no').check();
await radio('f-children-1-eucharist-received', 'no').check();
await radio('f-children-1-confirmation-received', 'no').check();
await shot('step7-children');

await page.locator('.ukcf-repeat-item').nth(1).locator('.ukcf-repeat-remove').click();
await page.waitForTimeout(250);
check('a child can be removed', (await page.locator('.ukcf-repeat-item').count()) === 1);
check('removing the second child keeps the first one intact',
  (await page.locator('#f-children-0-first').inputValue()) === 'Zofia',
  await page.locator('#f-children-0-first').inputValue());
await next();

// --- step 8: photographs -------------------------------------------------
check('advanced to photographs', (await stepTitle()).includes('Photographs'), await stepTitle());
await next();
check('the photo question has to be answered', await page.locator('.ukcf-summary').isVisible());
await radio('f-photoConsent', 'no').check();
await shot('step8-photos');
await next();

// --- step 9: review ------------------------------------------------------
check('advanced to review', (await stepTitle()).includes('Check your answers'), await stepTitle());
const reviewText = await page.locator('.ukcf-review').innerText();
check('review shows what was entered', reviewText.includes('Zofia') && reviewText.includes('Kowalski'),
  JSON.stringify(reviewText.slice(0, 300)));
check('review shows the formatted phone', reviewText.includes('(509) 674-2531'));
check('review hides the skipped home address', !reviewText.includes('Home address'));
check('review shows the photo answer',
  reviewText.includes('No, please do not use'), JSON.stringify(reviewText.slice(-260)));
await shot('step9-review');
await next();

// --- step 9: signature ---------------------------------------------------
check('advanced to signing', (await stepTitle()).includes('Sign and send'), await stepTitle());
check('the submit button says so',
  (await page.locator('.ukcf-btn--primary').innerText()).includes('Sign and submit'));
await shot('step10-sign-empty');

await next();
check('an unsigned form is refused', await page.locator('.ukcf-summary').isVisible());

await page.locator('#f-signature-econsent').check();
await page.locator('#f-signature-typed').fill('Mary Kowalski');
await page.locator('#f-signature-intent').check();
check('signing clears the warnings it was showing',
  (await page.locator('.ukcf-summary').isHidden())
  && (await page.locator('#f-signature-typed-msg').innerText()).trim() === ''
  && (await page.locator('#f-signature-attest-msg').innerText()).trim() === '',
  (await page.locator('#f-signature-typed-msg').innerText()).trim());

// The message clearing and the red border are set in different places, so a
// cleared message is not proof the field stopped looking wrong.
await settle();
const sigLook = await page.evaluate(() => {
  const el = document.querySelector('#f-signature-typed');
  const cs = getComputedStyle(el);
  return { invalid: el.getAttribute('aria-invalid'), border: cs.borderTopColor };
});
check('a signed name does not still look like an error',
  sigLook.invalid === 'false' && !/^rgb\(1[0-9]{2}, [0-9]{1,2}, [0-9]{1,2}\)$/.test(sigLook.border),
  JSON.stringify(sigLook));
await shot('step10-sign-filled');

// collect() returns the nested shape the Worker will receive, not flat paths.
const collected = await page.evaluate(() => window.ukcFormEngine.collect());
check('hidden answers stay out of the payload', collected.home?.street === undefined,
  JSON.stringify(collected.home));
check('the spouse answers are in the payload', collected.spouse?.first === 'Tomasz',
  JSON.stringify(Object.keys(collected)));
check('the removed child is gone from the payload', collected.children?.length === 1,
  JSON.stringify(collected.children?.length));
// The bug this replaced: a year-only date validated, then vanished on submit.
check('a year-only sacrament date survives to the payload',
  collected.children?.[0]?.baptism?.date === '2016',
  JSON.stringify(collected.children?.[0]?.baptism));
check('the tradition and country come through too',
  collected.children?.[0]?.baptism?.traditionName === 'Lutheran'
  && collected.children?.[0]?.baptism?.country === 'Mexico',
  JSON.stringify(collected.children?.[0]?.baptism));
check('the signature is in the payload', !!collected.signature?.typedName);
check('dates are sent as ISO', collected.head?.birthdate === '1979-04-02',
  JSON.stringify(collected.head?.birthdate));
check('the photo answer is recorded either way', collected.photoConsent === 'no',
  JSON.stringify(collected.photoConsent));

// The backend gets tested against whatever the browser actually posts. Writing
// the envelope out here keeps the two ends from drifting apart, which is what
// would happen if the fixture were hand-written next to the backend.
const envelope = await page.evaluate(() => {
  const e = window.ukcFormEngine;
  return {
    formId: e.schema.formId,
    formTitle: e.schema.title,
    version: e.schema.version,
    subjectPrefix: e.schema.subjectPrefix || e.schema.title,
    submittedAt: new Date().toISOString(),
    elapsedMs: 91000,
    data: e.collect(),
    labels: e.labelMap(),
    turnstileToken: null,
  };
});
// Written only when the backend folder is already present, so this check does
// not assume which backend wins.
if (existsSync(path.dirname(FIXTURE))) {
  await fs.writeFile(FIXTURE, `${JSON.stringify(envelope, null, 2)}\n`);
}
check('the submitted envelope carries labels and steps',
  envelope.labels['head.first']?.step === 'Head of household',
  JSON.stringify(envelope.labels['head.first']));

// --- the draft survives a reload ----------------------------------------
await page.reload({ waitUntil: 'load' });
await page.waitForSelector('.ukcf-form', { timeout: 5000 });
await page.waitForTimeout(300);
check('a saved draft is offered back', await page.locator('.ukcf-resume').isVisible());
check('the saved answers are still there',
  (await page.locator('#f-head-first').inputValue()) === 'Mary',
  await page.locator('#f-head-first').inputValue());
await shot('resume');

// --- mobile --------------------------------------------------------------
const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
await mobile.goto(`http://localhost:${PORT}/forms/parish-registration/`, { waitUntil: 'load' });
await mobile.waitForSelector('.ukcf-form', { timeout: 5000 });
const overflow = await mobile.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
check('no horizontal scroll on a phone', overflow <= 1, `${overflow}px`);
await mobile.screenshot({ path: path.join(SHOTS, '99-mobile.png'), fullPage: true });
await mobile.close();

// --- the other three forms ----------------------------------------------
// Parish registration gets walked end to end above. The rest are checked far
// enough to catch a schema that will not load or a step that renders empty,
// which is where a hand-written schema actually goes wrong.
for (const [slug, firstStep] of [
  ['faith-formation', 'Getting started'],
  ['ocia-participant', 'Getting started'],
  ['ocia-sponsor', 'What a sponsor does'],
]) {
  await page.goto(`http://localhost:${PORT}/forms/${slug}/`, { waitUntil: 'load' });
  await page.waitForSelector('.ukcf-form', { timeout: 5000 });
  check(`${slug}: the schema loads`, await page.locator('.ukcf-form').isVisible());
  const visible = page.locator('.ukcf-step:not([hidden])').first();
  check(`${slug}: the first step is titled`,
    (await visible.locator('.ukcf-step-title').innerText()).trim() === firstStep,
    (await visible.locator('.ukcf-step-title').innerText()).trim());
  check(`${slug}: the first step has content`,
    (await visible.locator('.ukcf-step-body').innerText()).trim().length > 40);
  await shot(`form-${slug}`);

  // Every step gets rendered once with nothing filled in, so a broken option
  // list or a static block that throws shows up here rather than in front of
  // someone registering their children.
  const steps = await page.evaluate(() => {
    const e = window.ukcFormEngine;
    return e.schema.steps.map((s) => s.title || s.id);
  });
  check(`${slug}: every step is titled`, steps.every((t) => t && t.trim()), steps.join(' > '));
}

// --- console -------------------------------------------------------------
check('no console errors', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));
check('no failed requests', badResponses.length === 0, badResponses.slice(0, 3).join(' | '));

await browser.close();
server.close();

const failed = report();
process.exit(failed ? 1 : 0);
