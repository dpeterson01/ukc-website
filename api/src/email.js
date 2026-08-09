/* Email out.
 *
 * Two messages per submission: the record to the office, and a receipt to the
 * family. The receipt is not a courtesy. It is the attribution control that
 * makes the signature defensible, because it puts the signed document in the
 * hands of the address that claimed to sign it.
 */

const RESEND = 'https://api.resend.com/emails';
const HOME_DOMAIN = 'ukccatholic.org';
const MAX_RECIPIENTS = 9;

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const EMAIL = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

/* Anyone can open a pull request against a public site repo. The allowlist is
 * what stops a one-line edit to recipients.json from turning the parish Worker
 * into someone else's mail relay. */
export function allowedRecipients(list, extraAllowed) {
  const extras = new Set(
    String(extraAllowed || '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
  return (list || [])
    .map((address) => String(address).trim())
    .filter((address) => EMAIL.test(address))
    .filter((address) => {
      const lower = address.toLowerCase();
      return lower.endsWith(`@${HOME_DOMAIN}`) || extras.has(lower);
    })
    .slice(0, MAX_RECIPIENTS);
}

export function resolveRecipients(table, formId, extraAllowed) {
  const entry = table[formId] || table._default || {};
  const to = allowedRecipients(entry.to, extraAllowed);
  const cc = allowedRecipients(entry.cc, extraAllowed);
  if (!to.length) throw new Error(`No deliverable recipient is configured for ${formId}.`);
  return { to, cc };
}

const bytesToBase64 = (bytes) => {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
};

function renderSections(sections) {
  return sections.map((section) => {
    const groups = section.groups.map((group) => {
      const rows = group.rows.map((row) => `
        <tr>
          <td style="padding:6px 14px 6px 0;vertical-align:top;width:190px;font:400 12px/1.4 Helvetica,Arial,sans-serif;color:#6b6b6b;">${escapeHtml(row.label)}</td>
          <td style="padding:6px 0;vertical-align:top;font:400 15px/1.45 Georgia,'Times New Roman',serif;color:#333;">${escapeHtml(row.value)}</td>
        </tr>`).join('');
      const subtitle = group.subtitle
        ? `<p style="margin:18px 0 2px;font:700 13px/1.3 Georgia,'Times New Roman',serif;color:#2E5E8A;">${escapeHtml(group.subtitle)}</p>`
        : '';
      return `${subtitle}<table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;">${rows}</table>`;
    }).join('');
    return `
      <h2 style="margin:30px 0 4px;font:700 17px/1.25 Georgia,'Times New Roman',serif;color:#2E5E8A;">${escapeHtml(section.title)}</h2>
      <div style="height:2px;background:#B8945F;margin-bottom:8px;"></div>
      ${groups}`;
  }).join('');
}

const shell = (parishName, title, lead, body, footer) => `
<div style="background:#F7F5F0;padding:24px 0;">
  <div style="max-width:640px;margin:0 auto;background:#fff;">
    <div style="background:#1A3A52;padding:26px 32px 22px;">
      <div style="font:700 22px/1.2 Georgia,'Times New Roman',serif;color:#fff;">${escapeHtml(title)}</div>
      <div style="font:400 12px/1.5 Helvetica,Arial,sans-serif;color:#c9d6e2;margin-top:4px;">${escapeHtml(parishName)}</div>
    </div>
    <div style="height:4px;background:#B8945F;"></div>
    <div style="padding:8px 32px 32px;">
      <p style="font:400 15px/1.55 Georgia,'Times New Roman',serif;color:#333;">${lead}</p>
      ${body}
      <div style="margin-top:34px;padding-top:14px;border-top:1px solid #ddd;font:400 11px/1.6 Helvetica,Arial,sans-serif;color:#6b6b6b;">${footer}</div>
    </div>
  </div>
</div>`;

const utc = (iso) => new Date(iso).toUTCString().replace('GMT', 'UTC');

// Shared with the contact handler, so both kinds of parish mail look the same.
export { escapeHtml, shell };
export const sendRaw = (env, message) => send(env, message);

const signerNames = (ctx) => (ctx.signatures || [])
  .map((s) => s.value.typedName)
  .filter(Boolean)
  .join(', ');

export function officeEmail(ctx) {
  const lead = ctx.submitterEmail
    ? `A ${escapeHtml(ctx.formTitle.toLowerCase())} came in from `
      + `<a href="mailto:${escapeHtml(ctx.submitterEmail)}" style="color:#2E5E8A;">${escapeHtml(ctx.submitterEmail)}</a>. `
      + 'Reply to this message and it goes straight to them.'
    : `A ${escapeHtml(ctx.formTitle.toLowerCase())} came in. No email address was given, so there is nothing to reply to.`;
  const signed = signerNames(ctx);
  const footer = `Reference ${escapeHtml(ctx.reference)}<br>`
    + `Received ${escapeHtml(utc(ctx.submittedAt))}<br>`
    + (signed ? `Signed electronically by ${escapeHtml(signed)}<br>` : '')
    + `Fingerprint ${escapeHtml(ctx.fingerprint.hmac.slice(0, 16))}<br><br>`
    + 'The PDF is the signed record. submission.json is the same answers in a form a computer can read, '
    + 'for when this gets imported into ParishSOFT.';
  return shell(ctx.parishName, ctx.formTitle, lead, renderSections(ctx.sections), footer);
}

/* The office reads one language whatever arrives. The family reads the one they
 * filled the form in, so the receipt carries its own wording. The Spanish
 * privacy line is the same sentence the form itself shows, word for word. */
const RECEIPT_TEXT = {
  en: {
    lead: 'Thank you. The parish office has your form. A copy is attached for your records, '
      + 'and nothing further is needed from you right now.',
    reference: 'Reference {reference}',
    signed: 'Signed electronically by {who}',
    correct: 'If anything above is wrong, or you did not fill out this form, call the parish '
      + 'office at {phone} and we will sort it out.',
    privacy: 'This information is used for the purposes of the Church Office only and will not '
      + 'be given out without consent.',
  },
  es: {
    lead: 'Gracias. La oficina parroquial ya tiene su formulario. Se adjunta una copia para sus '
      + 'archivos, y por ahora no necesita hacer nada más.',
    reference: 'Referencia {reference}',
    signed: 'Firmado electrónicamente por {who}',
    correct: 'Si algo de lo anterior está mal, o si usted no llenó este formulario, llame a la '
      + 'oficina parroquial al {phone} y lo resolvemos.',
    privacy: 'Esta información se usa únicamente para los fines de la oficina parroquial y no se '
      + 'compartirá sin su consentimiento.',
  },
};

// Static wording is ours and goes in as written; only the injected value is escaped.
const fill = (template, vars) => template.replace(
  /\{(\w+)\}/g,
  (whole, name) => (name in vars ? escapeHtml(vars[name]) : whole),
);

export function receiptEmail(ctx) {
  const words = RECEIPT_TEXT[ctx.lang] || RECEIPT_TEXT.en;
  const signed = signerNames(ctx);
  const footer = `${fill(words.reference, { reference: ctx.reference })}<br>`
    + (signed ? `${fill(words.signed, { who: signed })}<br>` : '')
    + `${escapeHtml(utc(ctx.submittedAt))}<br><br>`
    + `${fill(words.correct, { phone: ctx.parishPhone })}<br><br>`
    + words.privacy;
  return shell(
    ctx.parishName,
    ctx.formTitleLocal || ctx.formTitle,
    words.lead,
    renderSections(ctx.localSections || ctx.sections),
    footer,
  );
}

async function send(env, message) {
  const res = await fetch(RESEND, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(message),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Resend responded ${res.status}: ${detail.slice(0, 300)}`);
  }
  return res.json();
}

export async function deliver(env, ctx, pdfBytes, recipients) {
  const attachments = [
    { filename: `${ctx.reference}.pdf`, content: bytesToBase64(pdfBytes) },
    {
      filename: 'submission.json',
      content: bytesToBase64(new TextEncoder().encode(JSON.stringify(ctx.record, null, 2))),
    },
  ];

  const subject = `[${ctx.subjectPrefix}] ${ctx.subjectName} ${ctx.submittedAt.slice(0, 10)}`;

  await send(env, {
    from: env.MAIL_FROM,
    to: recipients.to,
    cc: recipients.cc.length ? recipients.cc : undefined,
    reply_to: ctx.submitterEmail || undefined,
    subject,
    html: officeEmail(ctx),
    attachments,
  });

  // The office copy is the one that matters. If the family's receipt bounces,
  // say so in the log and let the submission stand as successful.
  if (!ctx.submitterEmail) return { receipt: 'no address given' };
  try {
    await send(env, {
      from: env.MAIL_FROM,
      to: [ctx.submitterEmail],
      subject: `Your ${ctx.formTitle.toLowerCase()} · ${ctx.reference}`,
      html: receiptEmail(ctx),
      attachments: [attachments[0]],
    });
    return { receipt: 'sent' };
  } catch (err) {
    return { receipt: `failed: ${err.message}` };
  }
}
