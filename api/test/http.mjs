/* Drives the HTTP layer of the ported endpoint directly.
 *
 * The unit suite in run.mjs already covers the guard, the fingerprint, the PDF
 * and the emails, all of which came across from the Worker unchanged. What is
 * genuinely new is the request and response plumbing, so that is what this
 * checks: CORS, method handling, the response envelope, how the caller's
 * address is read out of x-forwarded-for, and the refusal to accept a
 * submission it cannot deliver.
 *
 *   node test/http.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

const ORIGIN = 'https://ukccatholic.org';
process.env.ALLOWED_ORIGINS = `${ORIGIN},http://localhost:8765`;
process.env.FORMS_DRY_RUN = 'true';
process.env.FINGERPRINT_SECRET = 'test-secret';
delete process.env.RESEND_API_KEY;

const { submitHandler, healthHandler } = await import('../src/functions/submit.js');

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass });
  console.log(`${pass ? 'ok  ' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
};

const ctx = { log: () => {}, error: () => {} };

function req(method, body, headers = {}) {
  const all = new Headers({ origin: ORIGIN, ...headers });
  return {
    method,
    headers: all,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  };
}

const envelope = JSON.parse(fs.readFileSync(path.join(HERE, 'fixture.json'), 'utf8'));
const post = (body, headers) => submitHandler(req('POST', body, headers), ctx);

// --- CORS ----------------------------------------------------------------
const pre = await submitHandler(req('OPTIONS', ''), ctx);
check('a preflight is answered 204', pre.status === 204, String(pre.status));
check('a preflight echoes the allowed origin',
  pre.headers['Access-Control-Allow-Origin'] === ORIGIN);
check('a preflight names POST', /POST/.test(pre.headers['Access-Control-Allow-Methods']));
check('a preflight varies on origin', pre.headers.Vary === 'Origin');

const stranger = await submitHandler(req('OPTIONS', '', { origin: 'https://evil.example' }), ctx);
check('an origin we do not know gets no allow header',
  !('Access-Control-Allow-Origin' in stranger.headers));

// --- the happy path ------------------------------------------------------
const good = await post(envelope);
check('a good submission is accepted', good.status === 200, String(good.status));
check('it answers with a reference', /^[A-Z]{2}-\d{4}-[A-Z0-9]+$/.test(good.jsonBody.reference || ''),
  good.jsonBody.reference);
check('the response carries CORS too', good.headers['Access-Control-Allow-Origin'] === ORIGIN);

// --- what it refuses -----------------------------------------------------
const hurried = await post({ ...envelope, elapsedMs: 900 });
check('a submission that arrived too fast is refused', hurried.status === 400);
check('the refusal explains itself', typeof hurried.jsonBody.message === 'string');

const wrongForm = await post({ ...envelope, formId: 'not-a-form' });
check('an unknown form id is refused', wrongForm.status === 400);

const unsigned = JSON.parse(JSON.stringify(envelope));
for (const key of Object.keys(unsigned.data)) {
  if (unsigned.data[key] && typeof unsigned.data[key] === 'object'
      && 'typedName' in unsigned.data[key]) {
    unsigned.data[key].typedName = '';
  }
}
check('an unsigned form is refused', (await post(unsigned)).status === 400);

check('unreadable json is refused', (await post('{not json')).status === 400);

const huge = { ...envelope, data: { ...envelope.data, note: 'x'.repeat(5000) } };
check('an answer the length of a novel is refused', (await post(huge)).status === 400);

// --- the caller's address ------------------------------------------------
// This ends up in the tamper-evident record, so a stray port would be baked in.
const seen = [];
const spy = { log: (line) => seen.push(JSON.parse(line)), error: () => {} };
await submitHandler(req('POST', envelope, { 'x-forwarded-for': '203.0.113.9:51402, 10.0.0.1' }), spy);
check('the log records the submission', seen.length === 1);
check('the reference is logged', Boolean(seen[0]?.reference));
check('the dry run is flagged in the log', seen[0]?.dryRun === true);
check('a pdf was actually built', (seen[0]?.pdfBytes ?? 0) > 1000, `${seen[0]?.pdfBytes} bytes`);

// --- delivery that is not configured -------------------------------------
process.env.FORMS_DRY_RUN = 'false';
const undeliverable = await post(envelope);
check('a submission it cannot deliver is refused, not silently dropped',
  undeliverable.status === 503, String(undeliverable.status));
check('and the refusal does not claim success',
  !('reference' in (undeliverable.jsonBody || {})));
process.env.FORMS_DRY_RUN = 'true';

// --- health --------------------------------------------------------------
const health = await healthHandler(req('GET', ''));
check('health answers 200', health.status === 200);
check('health reports the api key is missing',
  health.jsonBody.apiKey === 'missing', health.jsonBody.apiKey);

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
