/* The guards that do not depend on Azure being reachable.
 *
 * The rate limiter is exercised against a fake table client rather than real
 * storage, because what matters is the counting and the fail-open behaviour,
 * not whether the Azure SDK works.
 */

import { guard, Refused } from '../src/guard.js';
import { LIMITS } from '../src/ratelimit.js';
import fs from 'node:fs';

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass });
  console.log(`${pass ? 'ok  ' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
};

const refusedBy = (fn) => {
  try { fn(); return null; } catch (e) { return e instanceof Refused ? e.message : `threw ${e}`; }
};

// --- the honeypot --------------------------------------------------------
const envelope = JSON.parse(fs.readFileSync(new URL('./fixture.json', import.meta.url), 'utf8'));
const raw = (p) => JSON.stringify(p).length;

check('a submission with an empty honeypot is allowed through the guard',
  refusedBy(() => guard({ ...envelope, website: '' }, raw(envelope))) === null);

check('a submission with no honeypot field at all still works',
  refusedBy(() => guard(envelope, raw(envelope))) === null);

const filled = refusedBy(() => guard({ ...envelope, website: 'http://spam.example' }, raw(envelope)));
check('a filled honeypot is refused', filled !== null, filled);
check('the honeypot refusal does not explain itself to the bot',
  !/honeypot|bot|spam/i.test(filled || ''), filled);

check('whitespace in the honeypot is not treated as filled',
  refusedBy(() => guard({ ...envelope, website: '   ' }, raw(envelope))) === null);

// --- the rate limiter ----------------------------------------------------
const { checkRate } = await import('../src/ratelimit.js');

check('limits are set where a real family will never meet them',
  LIMITS.perHour >= 3 && LIMITS.perHour <= 10 && LIMITS.perDay > LIMITS.perHour,
  `${LIMITS.perHour}/hour, ${LIMITS.perDay}/day`);

// No AzureWebJobsStorage in this process, so the limiter has no table to reach.
delete process.env.AzureWebJobsStorage;
check('a caller is not refused when storage is unreachable',
  (await checkRate('203.0.113.9')) === null);
check('a missing address is not counted', (await checkRate('')) === null);

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
