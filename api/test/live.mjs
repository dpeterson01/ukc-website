/* Checks a deployed endpoint without mailing anyone.
 *
 * Every case here is one the endpoint is supposed to reject, plus health and
 * CORS. Nothing reaches the delivery step, so running this against production
 * does not put anything in the parish mailbox. Sending a real submission is a
 * deliberate act and should be done by filling the form in, once.
 *
 *   node test/live.mjs https://ukc-forms.azurewebsites.net
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BASE = (process.argv[2] || 'https://ukc-forms.azurewebsites.net').replace(/\/$/, '');
const ORIGIN = 'https://ukccatholic.org';

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass });
  console.log(`${pass ? 'ok  ' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
};

const post = (body) => fetch(`${BASE}/submit`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
  body: typeof body === 'string' ? body : JSON.stringify(body),
});

// --- health --------------------------------------------------------------
const health = await fetch(`${BASE}/health`, { headers: { Origin: ORIGIN } });
check('health answers 200', health.status === 200, String(health.status));
const healthBody = await health.json().catch(() => ({}));
check('health reports a well-formed api key',
  healthBody.apiKey === 'present', String(healthBody.apiKey));

// --- routing -------------------------------------------------------------
// host.json strips the /api prefix, so this is what proves that took effect.
check('the route has no /api prefix',
  (await fetch(`${BASE}/api/submit`, { method: 'POST' })).status === 404);
check('an unknown path is 404', (await fetch(`${BASE}/nope`)).status === 404);
check('GET /submit is not allowed', [404, 405].includes((await fetch(`${BASE}/submit`)).status));

// --- CORS ----------------------------------------------------------------
// The engine posts application/json, which is not a simple content type, so a
// browser always preflights first. The Functions host answers OPTIONS itself
// before the handler runs, which means this passes only if platform CORS is
// configured as well as ALLOWED_ORIGINS.
const pre = await fetch(`${BASE}/submit`, {
  method: 'OPTIONS',
  headers: {
    Origin: ORIGIN,
    'Access-Control-Request-Method': 'POST',
    'Access-Control-Request-Headers': 'content-type,accept',
  },
});
check('a preflight is answered', pre.status === 204, String(pre.status));
check('a preflight allows the parish site',
  pre.headers.get('access-control-allow-origin') === ORIGIN);
check('a preflight allows the content-type the engine sends',
  /content-type/i.test(pre.headers.get('access-control-allow-headers') || ''),
  pre.headers.get('access-control-allow-headers'));

const stranger = await fetch(`${BASE}/submit`, {
  method: 'OPTIONS',
  headers: { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'POST' },
});
check('an origin we do not know is not allowed',
  stranger.headers.get('access-control-allow-origin') === null);

// --- what it refuses -----------------------------------------------------
const envelope = JSON.parse(fs.readFileSync(path.join(HERE, 'fixture.json'), 'utf8'));

check('a submission that arrived too fast is refused',
  (await post({ ...envelope, elapsedMs: 900 })).status === 400);
check('an unknown form id is refused',
  (await post({ ...envelope, formId: 'not-a-form' })).status === 400);
check('unreadable json is refused', (await post('{not json')).status === 400);

const unsigned = JSON.parse(JSON.stringify(envelope));
for (const key of Object.keys(unsigned.data)) {
  const v = unsigned.data[key];
  if (v && typeof v === 'object' && 'typedName' in v) v.typedName = '';
}
check('an unsigned form is refused', (await post(unsigned)).status === 400);

const refusal = await post({ ...envelope, elapsedMs: 900 });
const refusalBody = await refusal.json().catch(() => ({}));
check('a refusal explains itself in words a person can read',
  typeof refusalBody.message === 'string' && refusalBody.message.length > 10,
  refusalBody.message);
check('a refusal does not leak a stack trace',
  !/at \w+ \(|\.js:\d+/.test(JSON.stringify(refusalBody)));

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed against ${BASE}`);
process.exit(failed.length ? 1 : 0);
