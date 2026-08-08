/* Tamper evidence.
 *
 * The parish keeps submissions in a mailbox, and a mailbox is editable. So the
 * PDF prints a short fingerprint that only this Worker could have produced. If
 * someone later disputes what they agreed to, you re-run the archived JSON
 * through the same function and compare. A mismatch means the record changed
 * after it was signed.
 *
 * This is not a certificate authority and does not pretend to be. It proves the
 * bytes are unchanged, nothing more.
 */

const enc = new TextEncoder();

/* JSON.stringify key order follows insertion order, which differs between two
 * structurally identical objects. Sorting makes the digest reproducible. */
export function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
}

const hex = (buffer) => [...new Uint8Array(buffer)]
  .map((b) => b.toString(16).padStart(2, '0'))
  .join('');

export async function fingerprint(record, secret) {
  const body = canonical(record);
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(body));

  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, digest);

  return { sha256: hex(digest), hmac: hex(signature) };
}

/* Short enough to read over the phone, long enough not to collide in a parish
 * of a few hundred families. */
export function reference(formId, submittedAt, uuid) {
  const initials = formId.split('-').map((p) => p[0]).join('').toUpperCase();
  const year = new Date(submittedAt).getUTCFullYear();
  return `${initials}-${year}-${uuid.replace(/-/g, '').slice(0, 6).toUpperCase()}`;
}
