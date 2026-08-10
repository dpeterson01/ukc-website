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

/* The chips carry their English label in data-en whatever language the page is
 * showing, so these are the strings that actually arrive. */
const ATTRIBUTES = {
  'Weekly bulletin': 'WEEKLY_BULLETIN',
  'Quarterly newsletter': 'QUARTERLY_NEWSLETTER',
  'Holy-day reminders': 'HOLY_DAY_REMINDERS',
};

/* Short codes rather than the full parish name, because this is what the segment
 * filters get written against. */
const PARISH_CODES = {
  'St. John the Baptist (Cle Elum)': 'SJB',
  'Immaculate Conception (Roslyn)': 'IC',
  'Both parishes': 'BOTH',
};

export const brevoConfigured = (env) => Boolean(
  env.BREVO_API_KEY && env.BREVO_LIST_ID && env.BREVO_DOI_TEMPLATE_ID,
);

/* One list with an attribute per interest, rather than a list each. Someone
 * changing what they get should stay one contact with one consent history. */
export function contactAttributes(subscriptions, parish) {
  const chosen = new Set(String(subscriptions || '').split(',').map((s) => s.trim()));
  const attributes = { SIGNUP_SOURCE: 'website footer' };
  for (const [label, name] of Object.entries(ATTRIBUTES)) attributes[name] = chosen.has(label);
  // Left unset rather than guessed, so an empty PARISH means nobody answered.
  const code = PARISH_CODES[String(parish || '').trim()];
  if (code) attributes.PARISH = code;
  return attributes;
}

export async function inviteContact(env, email, subscriptions, parish) {
  const res = await fetch(DOUBLE_OPTIN, {
    method: 'POST',
    headers: {
      'api-key': env.BREVO_API_KEY,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({
      email,
      attributes: contactAttributes(subscriptions, parish),
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
