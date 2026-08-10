/* POST /contact
 *
 * The contact form and the footer email signup. These used to go to Formspree,
 * which meant prayer requests passed through a third party while the page told
 * the person they were "shared only with Father and the parish office". They go
 * to the parish mailbox directly now, so the page is telling the truth.
 *
 * A signup goes to Brevo instead, once a list is configured, so the person gets
 * the confirmation email and the parish gets a consent record it can defend.
 * The mailbox is what catches it when Brevo is unconfigured or unreachable.
 *
 * Deliberately simpler than /submit: no PDF, no signature, no fingerprint.
 * Nothing here is signed, so there is nothing to prove was not altered.
 */

import { app } from '@azure/functions';
import { escapeHtml, shell, sendRaw } from '../email.js';
import { checkRate } from '../ratelimit.js';
import { brevoConfigured, inviteContact } from '../brevo.js';

const PARISH_NAME = 'Catholic Parishes of Upper Kittitas County';
const OFFICE = 'parish@ukccatholic.org';

const KINDS = new Set(['contact', 'signup']);
const LIMITS = { body: 32 * 1024, fields: 24, valueLength: 4000, minElapsedMs: 3000 };

class Refused extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

function corsHeaders(request) {
  const origin = request.headers.get('origin') || '';
  const allowed = String(process.env.ALLOWED_ORIGINS || '')
    .split(',').map((s) => s.trim()).filter(Boolean);
  const headers = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Accept',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
  if (allowed.includes(origin)) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

function clientIp(request) {
  const first = (request.headers.get('x-forwarded-for') || '').split(',')[0].trim();
  if (!first) return '';
  const isIpv6 = first.includes(':') && first.indexOf(':') !== first.lastIndexOf(':');
  return isIpv6 ? first : first.split(':')[0];
}

function guardContact(payload, rawLength) {
  if (rawLength > LIMITS.body) throw new Refused('That message is too long.', 413);
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Refused('We could not read that message.');
  }
  if (!KINDS.has(payload.kind)) throw new Refused('That form is not one we accept.');

  // Same reasoning as the main form: the browser checks these, and a script
  // posting straight here does not run the browser's code.
  if (typeof payload.website === 'string' && payload.website.trim() !== '') {
    throw new Refused('That message did not look like it came from a person.');
  }
  const elapsed = Number(payload.elapsedMs);
  if (!Number.isFinite(elapsed) || elapsed < LIMITS.minElapsedMs) {
    throw new Refused('That message came in too fast to be real.');
  }

  const fields = payload.fields;
  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) {
    throw new Refused('The message had nothing in it.');
  }
  const entries = Object.entries(fields);
  if (!entries.length) throw new Refused('The message had nothing in it.');
  if (entries.length > LIMITS.fields) throw new Refused('That message has too many parts.');
  for (const [label, value] of entries) {
    if (typeof label !== 'string' || typeof value !== 'string') {
      throw new Refused('We could not read that message.');
    }
    if (value.length > LIMITS.valueLength) throw new Refused('One of the answers is too long.');
  }
  return entries;
}

const emailIn = (entries) => {
  const found = entries.find(([, v]) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.trim()));
  return found ? found[1].trim() : '';
};

const valueIn = (entries, label) => (entries.find(([l]) => l === label) || [])[1] || '';

function body(entries) {
  const rows = entries.filter(([, v]) => v.trim()).map(([label, value]) => `
    <tr>
      <td style="padding:6px 14px 6px 0;vertical-align:top;width:190px;font:400 12px/1.4 Helvetica,Arial,sans-serif;color:#6b6b6b;">${escapeHtml(label)}</td>
      <td style="padding:6px 0;vertical-align:top;font:400 15px/1.45 Georgia,'Times New Roman',serif;color:#333;">${escapeHtml(value)}</td>
    </tr>`).join('');
  return `<table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;">${rows}</table>`;
}

export async function contactHandler(request, context) {
  const headers = corsHeaders(request);
  if (request.method === 'OPTIONS') return { status: 204, headers };

  try {
    const raw = await request.text();
    let payload;
    try { payload = JSON.parse(raw); } catch { throw new Refused('We could not read that message.'); }

    const entries = guardContact(payload, raw.length);

    const limited = await checkRate(clientIp(request));
    if (limited) {
      throw new Refused('That is several messages in a short time. Please call the parish office at (509) 674-2531.', 429);
    }

    const subject = String(payload.subject || 'Message from the parish website').slice(0, 200);
    const replyTo = emailIn(entries);
    const receivedAt = new Date().toISOString();

    let listRefused = false;
    if (payload.kind === 'signup' && brevoConfigured(process.env)) {
      if (!replyTo) throw new Refused('We need an email address to sign you up.');
      try {
        const outcome = await inviteContact(
          process.env,
          replyTo,
          valueIn(entries, 'Subscriptions'),
          valueIn(entries, 'Parish'),
        );
        context.log(JSON.stringify({ event: 'contact', kind: 'signup', brevo: outcome }));
        return { status: 200, jsonBody: { ok: true }, headers };
      } catch (err) {
        // The address is worth more than the invitation. Fall through to the
        // mailbox so the office can add it by hand rather than lose it.
        context.error('brevo invite failed', err && err.stack ? err.stack : String(err));
        listRefused = true;
      }
    }

    if (!process.env.RESEND_API_KEY) {
      throw new Refused('The parish mail service is not configured yet.', 503);
    }

    await sendRaw(process.env, {
      from: process.env.MAIL_FROM,
      to: [OFFICE],
      reply_to: replyTo || undefined,
      subject,
      html: shell(
        PARISH_NAME,
        payload.kind === 'signup' ? 'Email list signup' : 'Message from the website',
        listRefused
          ? `The mailing list would not take <strong>${escapeHtml(replyTo)}</strong>, so this one `
            + 'needs adding in Brevo by hand.'
          : replyTo
            ? `Reply to this email and it goes straight back to <strong>${escapeHtml(replyTo)}</strong>.`
            : 'No email address was given, so there is no reply path.',
        body(entries),
        `Received ${escapeHtml(new Date(receivedAt).toUTCString().replace('GMT', 'UTC'))}<br>`
        + 'Sent from the parish website. Nothing about it is stored outside this mailbox.',
      ),
    });

    context.log(JSON.stringify({
      event: 'contact', kind: payload.kind, subject, hasReplyTo: Boolean(replyTo),
    }));
    return { status: 200, jsonBody: { ok: true }, headers };
  } catch (err) {
    if (err instanceof Refused) {
      return { status: err.status, jsonBody: { message: err.message }, headers };
    }
    context.error('contact failed', err && err.stack ? err.stack : String(err));
    return {
      status: 500,
      jsonBody: { message: 'Something went wrong on our end and the message was not sent.' },
      headers,
    };
  }
}

app.http('contact', {
  methods: ['POST', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'contact',
  handler: contactHandler,
});
