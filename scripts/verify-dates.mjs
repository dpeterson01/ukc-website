/* Approximate dates.
 *
 * A sacrament forty years ago is often remembered as a year and nothing more.
 * Before this, an incomplete date validated fine and was then silently dropped
 * on submit, so the help text saying "a year on its own is fine" was not true.
 *
 *   node scripts/verify-dates.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

const sandbox = { window: {}, console };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'site/forms/engine/validate.js'), 'utf8'), sandbox);
const V = sandbox.window.UKCValidate;

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass });
  console.log(`${pass ? 'ok  ' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
};

const parts = (month, day, year) => ({ month, day, year });
const approx = { type: 'date', label: 'Date of baptism', approximate: true };
const exact = { type: 'date', label: 'Date of birth' };

// --- what an approximate date resolves to --------------------------------
check('a full date keeps its day',
  V.approximateIso(parts('6', '10', '1979')) === '1979-06-10',
  V.approximateIso(parts('6', '10', '1979')));
check('a month and year keep the month',
  V.approximateIso(parts('6', '', '1979')) === '1979-06',
  V.approximateIso(parts('6', '', '1979')));
check('a year on its own survives',
  V.approximateIso(parts('', '', '1979')) === '1979',
  V.approximateIso(parts('', '', '1979')));
check('a single-digit month is padded',
  V.approximateIso(parts('6', '', '1979')) === '1979-06');
check('a day with no month is refused, since nobody can act on it',
  V.approximateIso(parts('', '10', '1979')) === '');
check('a two-digit year is not a year',
  V.approximateIso(parts('', '', '79')) === '');
check('a thirteenth month is refused', V.approximateIso(parts('13', '', '1979')) === '');
check('February 30th is still refused', V.approximateIso(parts('2', '30', '1979')) === '');
check('nothing at all resolves to nothing', V.approximateIso(parts('', '', '')) === '');

// --- what it accepts -----------------------------------------------------
const err = (field, value) => (V.checkField(field, value).error || null);

check('a year alone passes validation', err(approx, parts('', '', '1979')) === null);
check('a full date passes validation', err(approx, parts('6', '10', '1979')) === null);
check('an empty optional date passes', err(approx, parts('', '', '')) === null);
check('a day with no month is explained, not just rejected',
  /month/i.test(err(approx, parts('', '10', '1979')) || ''),
  err(approx, parts('', '10', '1979')));

const future = String(new Date().getUTCFullYear() + 5);
check('a year in the future is still refused',
  /future/i.test(err(approx, parts('', '', future)) || ''),
  err(approx, parts('', '', future)));

check('a required approximate date asks only for a year',
  /year/i.test(err({ ...approx, required: true }, parts('', '', '')) || ''),
  err({ ...approx, required: true }, parts('', '', '')));

// --- exact dates are untouched -------------------------------------------
check('an exact date still needs all three parts',
  /month, day, and year/.test(err({ ...exact, required: true }, parts('', '', '1979')) || ''),
  err({ ...exact, required: true }, parts('', '', '1979')));
check('an exact date still rejects February 30th',
  err(exact, parts('2', '30', '1979')) !== null);
check('a valid exact date still passes', err(exact, parts('6', '10', '1979')) === null);

// --- the bug this fixes --------------------------------------------------
check('the old path would have dropped a year-only answer',
  V.isoDate(parts('', '', '1979')) === '' && V.approximateIso(parts('', '', '1979')) === '1979');

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
