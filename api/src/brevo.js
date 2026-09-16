/* The mailing list.
 *
 * A signup used to end its life as an email in the parish mailbox, which left
 * the consent record as a message someone would have to find again before they
 * could defend a complaint. Brevo sends the confirmation itself and only puts
 * the address on the list once the person clicks it, so the proof of consent
 * ends up attached to the list it applies to.
 *
 * All of this is optional. With no key configured the caller falls back to the
 * mailbox, which is what runs until the list and its confirmation email exist.
 */

const DOUBLE_OPTIN = 'https://api.brevo.com/v3/contacts/doubleOptinConfirmation';

export const brevoConfigured = (env) => Boolean(
  env.BREVO_API_KEY && env.BREVO_LIST_ID && env.BREVO_DOI_TEMPLATE_ID,
);

/* Signup is intentionally simple. Everyone starts with the complete parish
 * update stream and can narrow it later through Brevo's profile-update form. */
export function contactAttributes(firstName, lastName) {
  const attributes = {
    SIGNUP_SOURCE: 'website footer',
    WEEKLY_BULLETIN: true,
    QUARTERLY_NEWSLETTER: true,
    HOLY_DAY_REMINDERS: true,
    PARISH: 'BOTH',
    PARISH_PREFERENCE: 1,
  };
  if (String(firstName || '').trim()) attributes.FIRSTNAME = String(firstName).trim();
  if (String(lastName || '').trim()) attributes.LASTNAME = String(lastName).trim();
  return attributes;
}

export async function inviteContact(env, email, firstName, lastName) {
  const res = await fetch(DOUBLE_OPTIN, {
    method: 'POST',
    headers: {
      'api-key': env.BREVO_API_KEY,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({
      email,
      attributes: contactAttributes(firstName, lastName),
      includeListIds: [Number(env.BREVO_LIST_ID)],
      templateId: Number(env.BREVO_DOI_TEMPLATE_ID),
      redirectionUrl: env.BREVO_DOI_REDIRECT_URL || 'https://ukccatholic.org/',
    }),
  });

  if (res.ok) return 'invited';

  const detail = await res.text().catch(() => '');
  // Signing up twice is not a mistake the person needs telling about, and a
  // second invitation to an address already on the list would only confuse it.
  if (res.status === 400 && detail.includes('duplicate_parameter')) return 'already on the list';
  throw new Error(`Brevo responded ${res.status}: ${detail.slice(0, 300)}`);
}
