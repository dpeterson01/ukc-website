/* POST /submit
 *
 * One endpoint. It takes what the form engine posts, refuses anything that
 * looks wrong, builds a signed PDF, and mails it to the office and back to the
 * family. Nothing is stored here. The parish mailbox is the record for now, and
 * retention on that mailbox already covers it.
 *
 * Ported from the Cloudflare Worker. Everything it refuses and everything it
 * builds is unchanged; only the request and response plumbing differs.
 */

import { readFileSync } from 'node:fs';
import { app } from '@azure/functions';

import { guard, Refused } from '../guard.js';
import { fingerprint, reference } from '../fingerprint.js';
import { sections, submitterEmail, subjectName } from '../summary.js';
import { buildPdf } from '../pdf.js';
import { resolveRecipients, deliver } from '../email.js';
import { checkRate } from '../ratelimit.js';

const PARISH_NAME = 'Catholic Parishes of Upper Kittitas County';

/* Workers could `import` JSON directly. Node needs it read, and reading it once
 * at module load keeps it out of the per-request path. */
const recipientTable = JSON.parse(
  readFileSync(new URL('../../recipients.json', import.meta.url), 'utf8'),
);

function corsHeaders(request) {
  const origin = request.headers.get('origin') || '';
  const allowed = String(process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const headers = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Accept',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
  if (allowed.includes(origin)) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

/* App Service puts the caller first in x-forwarded-for and appends a port that
 * would otherwise end up in the tamper-evident record as part of the address. */
function clientIp(request) {
  const forwarded = request.headers.get('x-forwarded-for') || '';
  const first = forwarded.split(',')[0].trim();
  if (!first) return '';
  const isIpv6 = first.includes(':') && first.indexOf(':') !== first.lastIndexOf(':');
  return isIpv6 ? first : first.split(':')[0];
}

async function handleSubmit(request) {
  const raw = await request.text();
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    throw new Refused('We could not read that submission.');
  }

  const { formId, signatures } = guard(payload, raw.length);

  const ip = clientIp(request);
  const userAgent = request.headers.get('user-agent') || '';

  /* Checked after the guard, so a flood of malformed junk costs a table write
   * per request rather than nothing, but before the PDF and the mail, which are
   * the parts that cost money. */
  const limited = await checkRate(ip);
  if (limited) {
    throw new Refused(
      limited === 'hour'
        ? 'That is several forms in a short time. Please wait an hour, or call the parish office at (509) 674-2531.'
        : 'That is a lot of forms for one day. Please call the parish office at (509) 674-2531.',
      429,
    );
  }

  const submittedAt = new Date().toISOString();
  const id = crypto.randomUUID();
  const ref = reference(formId, submittedAt, id);

  /* The fingerprint covers everything that would matter in a dispute: the
   * answers, which version of the wording they saw, when it arrived, and where
   * from. Leave any of that out and it can be changed without detection. */
  const record = {
    id,
    reference: ref,
    formId,
    formTitle: payload.formTitle || formId,
    version: payload.version || '1',
    submittedAt,
    clientSubmittedAt: payload.submittedAt || null,
    elapsedMs: payload.elapsedMs,
    ip,
    userAgent,
    data: payload.data,
    labels: payload.labels,
  };
  const print = await fingerprint(record, process.env.FINGERPRINT_SECRET || 'development-only-secret');
  record.fingerprint = print;

  const ctx = {
    formId,
    formTitle: payload.formTitle || formId,
    formVersion: payload.version || '1',
    subjectPrefix: payload.subjectPrefix || payload.formTitle || formId,
    reference: ref,
    submittedAt,
    sections: sections(payload.labels),
    signatures: signatures.map((s) => ({ ...s, title: 'Signature' })),
    submitterEmail: submitterEmail(payload.data),
    subjectName: subjectName(payload.data, signatures),
    disclosureVersion: signatures[0].value.disclosureVersion,
    fingerprint: print,
    parishName: PARISH_NAME,
    parishPhone: process.env.PARISH_PHONE || '(509) 674-2531',
    ip,
    userAgent,
    record,
  };

  const recipients = resolveRecipients(recipientTable, formId, process.env.EXTRA_ALLOWED_RECIPIENTS);
  const pdfBytes = await buildPdf(ctx);

  /* A submission that is accepted but never delivered is the worst outcome
   * here, because the family is told it worked and the office never sees it.
   * So a missing key is a refusal, not a skip, unless dry run is asked for
   * explicitly. That flag is how the endpoint gets tested before the parish
   * mail account exists. */
  const dryRun = String(process.env.FORMS_DRY_RUN || '') === 'true';
  if (!process.env.RESEND_API_KEY && !dryRun) {
    throw new Refused('The parish mail service is not configured yet.', 503);
  }

  const result = dryRun
    ? { receipt: 'dry run, nothing sent' }
    : await deliver(process.env, ctx, pdfBytes, recipients);

  return {
    body: { reference: ref },
    log: {
      event: 'submission',
      reference: ref,
      formId,
      to: recipients.to,
      receipt: result.receipt,
      pdfBytes: pdfBytes.length,
      fingerprint: print.hmac.slice(0, 16),
      dryRun,
    },
  };
}

/* Exported so the tests can drive them directly. Standing up the Functions host
 * to check a CORS header is a slow way to learn very little. */
export async function submitHandler(request, context) {
  const headers = corsHeaders(request);
  if (request.method === 'OPTIONS') return { status: 204, headers };

  try {
    const { body, log } = await handleSubmit(request);
    context.log(JSON.stringify(log));
    return { status: 200, jsonBody: body, headers };
  } catch (err) {
    if (err instanceof Refused) {
      return { status: err.status, jsonBody: { message: err.message }, headers };
    }
    // Whatever broke, the person on the other end gets a phone number rather
    // than a stack trace, and the detail goes to the log.
    context.error('submission failed', err && err.stack ? err.stack : String(err));
    return {
      status: 500,
      jsonBody: { message: 'Something went wrong on our end and the form was not sent.' },
      headers,
    };
  }
}

export async function healthHandler(request) {
  /* Reports the shape of the key, not just its presence. A placeholder pasted
   * in by mistake is indistinguishable from a real key to anything that only
   * checks for a non-empty value, and the resulting failure is a 500 at the
   * moment someone submits a form. */
  const key = process.env.RESEND_API_KEY || '';
  const apiKey = !key ? 'missing' : key.startsWith('re_') ? 'present' : 'malformed';
  return {
    status: 200,
    // Says only what it can see. Whether Resend will accept a send also depends
    // on the sending domain being verified, which this cannot know without
    // calling out to Resend on every health check.
    jsonBody: { ok: apiKey !== 'malformed', apiKey },
    headers: corsHeaders(request),
  };
}

app.http('submit', {
  methods: ['POST', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'submit',
  handler: submitHandler,
});

app.http('health', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'health',
  handler: healthHandler,
});
