/* Runs the Worker's pipeline outside the Worker.
 *
 * The fixture is written by scripts/verify-forms.mjs after it walks the real
 * form in a real browser, so this exercises the exact envelope a family will
 * post rather than something hand-written to match.
 *
 * Resend is the only piece that is not exercised. Everything up to the point of
 * handing bytes to it is, and the two emails get written to disk so they can be
 * looked at.
 *
 *   cd worker && npm test
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { guard, Refused } from '../src/guard.js';
import { fingerprint, reference, canonical } from '../src/fingerprint.js';
import { sections, submitterEmail, subjectName } from '../src/summary.js';
import { buildPdf } from '../src/pdf.js';
import { officeEmail, receiptEmail, resolveRecipients, allowedRecipients } from '../src/email.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = '/tmp/ukc-shots/worker';

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'ok  ' : 'FAIL'}  ${name}${detail && !pass ? `  [${detail}]` : ''}`);
};

const refuses = (name, fn, fragment) => {
  try {
    fn();
    check(name, false, 'it was accepted');
  } catch (err) {
    const ok = err instanceof Refused && err.message.toLowerCase().includes(fragment);
    check(name, ok, err.message);
  }
};

await fs.rm(OUT, { recursive: true, force: true });
await fs.mkdir(OUT, { recursive: true });

const payload = JSON.parse(await fs.readFile(path.join(HERE, 'fixture.json'), 'utf8'));
const table = JSON.parse(await fs.readFile(path.join(HERE, '..', 'recipients.json'), 'utf8'));

/* --- what the Worker refuses --------------------------------------------- */

const clone = () => JSON.parse(JSON.stringify(payload));

const { formId, signatures } = guard(payload, JSON.stringify(payload).length);
check('a real submission gets through', formId === 'parish-registration', formId);
check('the signature block was found', signatures.length === 1 && signatures[0].path === 'signature',
  JSON.stringify(signatures.map((s) => s.path)));

refuses('a form id we do not serve is refused', () => {
  const p = clone(); p.formId = 'wire-transfer'; guard(p, 100);
}, 'not one we accept');

refuses('a submission filled out in two seconds is refused', () => {
  const p = clone(); p.elapsedMs = 2000; guard(p, 100);
}, 'too fast');

refuses('an unsigned submission is refused', () => {
  const p = clone(); delete p.data.signature; guard(p, 100);
}, 'not signed');

refuses('a signature without intent is refused', () => {
  const p = clone(); p.data.signature.intentToSign = false; guard(p, 100);
}, 'intent to sign');

refuses('a signature without records consent is refused', () => {
  const p = clone(); p.data.signature.electronicRecordsConsent = false; guard(p, 100);
}, 'electronic records');

refuses('an oversized body is refused', () => guard(payload, 9 * 1024 * 1024), 'too large');

refuses('a runaway repeat block is refused', () => {
  const p = clone();
  p.data.children = new Array(80).fill({ first: 'A', last: 'B' });
  guard(p, 100);
}, 'too many entries');

refuses('an answer the length of a novel is refused', () => {
  const p = clone(); p.data.head.first = 'x'.repeat(5000); guard(p, 100);
}, 'too long');

/* --- recipients ----------------------------------------------------------- */

check('an outside address is dropped unless it is named',
  allowedRecipients(['parish@ukccatholic.org', 'attacker@example.com'], '').length === 1,
  JSON.stringify(allowedRecipients(['parish@ukccatholic.org', 'attacker@example.com'], '')));

check('an outside address named in the allowlist gets through',
  allowedRecipients(['coordinator@gmail.com'], 'coordinator@gmail.com').length === 1);

check('the recipient list is capped',
  allowedRecipients(new Array(30).fill('parish@ukccatholic.org'), '').length === 9);

const recipients = resolveRecipients(table, formId, '');
check('the registration form routes to the parish office',
  recipients.to[0] === 'parish@ukccatholic.org', JSON.stringify(recipients));

const fallback = resolveRecipients(table, 'ocia-sponsor', '');
check('an unlisted form falls back to the default', fallback.to.length === 1);

let refusedEmptyRouting = false;
try {
  resolveRecipients({ _default: { to: ['nobody@example.com'] } }, 'x', '');
} catch { refusedEmptyRouting = true; }
check('routing that survives no address at all is an error, not a silent drop', refusedEmptyRouting);

/* --- fingerprint ---------------------------------------------------------- */

check('canonical json sorts keys',
  canonical({ b: 1, a: [2, { d: 4, c: 3 }] }) === '{"a":[2,{"c":3,"d":4}],"b":1}',
  canonical({ b: 1, a: [2, { d: 4, c: 3 }] }));

const submittedAt = new Date().toISOString();
const id = crypto.randomUUID();
const ref = reference(formId, submittedAt, id);
check('the reference reads like a reference', /^PR-\d{4}-[0-9A-F]{6}$/.test(ref), ref);

const record = { id, reference: ref, formId, submittedAt, data: payload.data, labels: payload.labels };
const print = await fingerprint(record, 'test-secret');
const again = await fingerprint(JSON.parse(JSON.stringify(record)), 'test-secret');
check('the same record fingerprints the same way', print.hmac === again.hmac);

const tampered = JSON.parse(JSON.stringify(record));
tampered.data.head.last = 'Nowak';
const afterEdit = await fingerprint(tampered, 'test-secret');
check('editing one letter changes the fingerprint', afterEdit.hmac !== print.hmac);

const otherSecret = await fingerprint(record, 'a-different-secret');
check('a different secret produces a different fingerprint', otherSecret.hmac !== print.hmac);

/* --- summary -------------------------------------------------------------- */

const built = sections(payload.labels);
check('the summary keeps the steps in form order',
  built[0].title === 'Getting started' && built.some((s) => s.title === 'Children'),
  built.map((s) => s.title).join(' / '));

const children = built.find((s) => s.title === 'Children');
check('each child gets its own heading',
  children.groups.some((g) => g.subtitle === 'Child 1'),
  JSON.stringify(children.groups.map((g) => g.subtitle)));

check('the submitter email is found', submitterEmail(payload.data) === 'mary@example.com',
  String(submitterEmail(payload.data)));
check('the subject names the household',
  subjectName(payload.data, signatures) === 'Kowalski Household',
  subjectName(payload.data, signatures));

check('blank answers never reach the summary',
  built.every((s) => s.groups.every((g) => g.rows.every((r) => r.value.trim()))));

/* --- pdf ------------------------------------------------------------------ */

const ctx = {
  formId,
  formTitle: payload.formTitle,
  formVersion: payload.version,
  subjectPrefix: payload.subjectPrefix,
  reference: ref,
  submittedAt,
  sections: built,
  signatures: signatures.map((s) => ({ ...s, title: 'Signature' })),
  submitterEmail: submitterEmail(payload.data),
  subjectName: subjectName(payload.data, signatures),
  disclosureVersion: signatures[0].value.disclosureVersion,
  fingerprint: print,
  parishName: 'Catholic Parishes of Upper Kittitas County',
  parishPhone: '(509) 674-2531',
  ip: '203.0.113.44',
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15',
  record,
};

const pdf = await buildPdf(ctx);
await fs.writeFile(path.join(OUT, 'submission.pdf'), pdf);
check('the pdf is a pdf', Buffer.from(pdf.subarray(0, 5)).toString() === '%PDF-', String(pdf.length));
check('the pdf is a plausible size', pdf.length > 4000 && pdf.length < 3000000, `${pdf.length} bytes`);

// A name with characters the standard PDF fonts cannot encode must not take
// down the whole submission.
const accented = { ...ctx, sections: [{ title: 'Nazwiska', groups: [{ subtitle: null, rows: [
  { label: 'Last name', value: 'Kowalczyk-Wiśniewska' },
  { label: 'Notes', value: 'Żółć — “quoted” … ünüm' },
] }] }] };
let accentedOk = true;
try { await buildPdf(accented); } catch (err) { accentedOk = false; check('accented render', false, err.message); }
check('names the built-in fonts cannot spell do not break the pdf', accentedOk);

/* --- email ---------------------------------------------------------------- */

const office = officeEmail(ctx);
const receipt = receiptEmail(ctx);
await fs.writeFile(path.join(OUT, 'office.html'), office);
await fs.writeFile(path.join(OUT, 'receipt.html'), receipt);

check('the office email offers a reply path', office.includes('mailto:mary@example.com'));
check('the office email carries the fingerprint', office.includes(print.hmac.slice(0, 16)));
check('both emails name who signed',
  office.includes('Signed electronically by Mary Kowalski')
  && receipt.includes('Signed electronically by Mary Kowalski'));
check('the receipt carries the office promise',
  receipt.includes('will not be given out without consent'));
check('the receipt does not leak the submitter IP', !receipt.includes('203.0.113.44'));

const injected = officeEmail({
  ...ctx,
  sections: [{ title: '<script>t()</script>', groups: [{ subtitle: null, rows: [
    { label: '<img src=x onerror=alert(1)>', value: '"><script>alert(2)</script>' },
  ] }] }],
});
check('markup in an answer is escaped, not rendered',
  !injected.includes('<script>alert(2)</script>') && injected.includes('&lt;script&gt;'),
  injected.includes('<script>alert(2)</script>') ? 'raw script survived' : '');

const subject = `[${ctx.subjectPrefix}] ${ctx.subjectName} ${submittedAt.slice(0, 10)}`;
check('the subject line is filterable',
  /^\[.+\] Kowalski Household \d{4}-\d{2}-\d{2}$/.test(subject), subject);

/* --- a Spanish submission ------------------------------------------------- */

/* The stored fixture is English. A Spanish one carries the family's wording
 * beside the English the office reads, so both copies are built from the one
 * label map. */
const esLabels = {
  parish: {
    label: 'Which parish?', step: 'Getting started', display: 'St. John the Baptist',
    labelLocal: '¿Cuál parroquia?', stepLocal: 'Para empezar', displayLocal: 'San Juan Bautista',
  },
  'children.0.first': {
    label: 'First name', step: 'Children', display: 'Zofia',
    labelLocal: 'Nombre', stepLocal: 'Hijos', displayLocal: 'Zofia',
  },
};
const esRepeats = { children: { label: 'Child', labelLocal: 'Hijo o hija' } };

const englishSide = sections(esLabels, { repeatLabels: esRepeats });
const spanishSide = sections(esLabels, { local: true, repeatLabels: esRepeats });

check('the office still reads a Spanish submission in English',
  englishSide[0].title === 'Getting started'
  && englishSide[0].groups[0].rows[0].label === 'Which parish?'
  && englishSide[0].groups[0].rows[0].value === 'St. John the Baptist');
check('the family copy is built in their own language',
  spanishSide[0].title === 'Para empezar'
  && spanishSide[0].groups[0].rows[0].label === '¿Cuál parroquia?'
  && spanishSide[0].groups[0].rows[0].value === 'San Juan Bautista');
check('a repeated block is named in each language',
  englishSide[1].groups[0].subtitle === 'Child 1'
  && spanishSide[1].groups[0].subtitle === 'Hijo o hija 1',
  `${englishSide[1].groups[0].subtitle} / ${spanishSide[1].groups[0].subtitle}`);
check('a label with no translation falls back to English',
  sections({ x: { label: 'Envelope number', step: 'Getting started', display: '412' } },
    { local: true })[0].groups[0].rows[0].label === 'Envelope number');

const esCtx = {
  ...ctx, lang: 'es', formTitleLocal: 'Inscripción parroquial', localSections: spanishSide,
};
const esReceipt = receiptEmail(esCtx);
check('the Spanish receipt is written in Spanish',
  esReceipt.includes('La oficina parroquial ya tiene su formulario')
  && esReceipt.includes('Inscripción parroquial'));
check('the Spanish receipt keeps the wording the form promised',
  esReceipt.includes('no se compartirá sin su consentimiento'));
check('no English boilerplate is left in the Spanish receipt',
  !/Thank you\.|Signed electronically by|will not be given out without consent/.test(esReceipt));
check('the office copy of a Spanish submission stays English',
  officeEmail(esCtx).includes('came in from') && officeEmail(esCtx).includes('Getting started'));
check('an English submission is unaffected',
  receiptEmail(ctx).includes('Thank you. The parish office has your form'));

/* --- report --------------------------------------------------------------- */

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
console.log(`pdf and emails in ${OUT}`);
process.exit(failed.length ? 1 : 0);
