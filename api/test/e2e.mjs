/* Sends ONE real submission through the deployed endpoint.
 *
 * This is the only test that actually mails anyone, which is why it refuses to
 * run without --confirm. It puts a signed PDF in the parish office mailbox.
 *
 *   node test/e2e.mjs --confirm --receipt you@example.com
 *
 * The receipt address is yours on purpose. The stored fixture uses
 * mary@example.com, which accepts no mail, and a hard bounce is a poor first
 * impression for a sending domain with no reputation yet.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const BASE = (args.find((a) => a.startsWith('http')) || 'https://ukc-forms.azurewebsites.net').replace(/\/$/, '');
const receipt = args[args.indexOf('--receipt') + 1];

if (!args.includes('--confirm')) {
  console.log('This sends real email to the parish office. Re-run with --confirm.');
  process.exit(1);
}
if (!receipt || !receipt.includes('@')) {
  console.log('Pass --receipt <your address> so the family copy goes somewhere real.');
  process.exit(1);
}

const envelope = JSON.parse(fs.readFileSync(path.join(HERE, 'fixture.json'), 'utf8'));

// Retarget every address in the answers, so the receipt reaches a real inbox.
const swap = (node) => {
  if (Array.isArray(node)) return node.map(swap);
  if (node && typeof node === 'object') {
    return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, swap(v)]));
  }
  if (typeof node === 'string' && /^[\w.+-]+@[\w.-]+\.\w+$/.test(node)) return receipt;
  return node;
};
envelope.data = swap(envelope.data);
envelope.submittedAt = new Date().toISOString();
envelope.elapsedMs = 91000;

const res = await fetch(`${BASE}/submit`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Origin: 'https://ukccatholic.org' },
  body: JSON.stringify(envelope),
});
const body = await res.json().catch(() => ({}));

console.log(`status   ${res.status}`);
console.log(`body     ${JSON.stringify(body)}`);
if (res.status === 200 && body.reference) {
  console.log(`\nSent. Reference ${body.reference}.`);
  console.log(`Office copy  -> parish@ukccatholic.org`);
  console.log(`Receipt      -> ${receipt}`);
  console.log('\nCheck: both arrived, the PDF opens, the fingerprint is printed on it,');
  console.log('and the office copy replies to the submitter rather than to no-one.');
} else {
  console.log('\nNot sent. Check the Resend dashboard and the function logs:');
  console.log('  az webapp log tail -n ukc-forms -g ukc-forms');
}
process.exit(res.status === 200 ? 0 : 1);
