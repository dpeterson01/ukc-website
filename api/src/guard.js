/* What the Worker refuses.
 *
 * The browser already validated every field against the schema. Repeating that
 * here would mean shipping a second copy of the rules and keeping the two in
 * step forever. So this file checks the two things the browser genuinely cannot
 * be trusted on: the shape and size of what arrived, and whether the signature
 * block is complete. The signature is the part with legal weight, and it is the
 * one thing that must never be taken on the client's word.
 */

const FORM_IDS = new Set([
  'parish-registration',
  'faith-formation',
  'ocia-participant',
  'ocia-sponsor',
]);

const LIMITS = {
  body: 256 * 1024,
  fields: 400,
  stringLength: 4000,
  depth: 8,
  arrayLength: 40,
  minElapsedMs: 5000,
};

export class Refused extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/* Walks the submitted answers looking for anything that would blow up the PDF
 * renderer or the email body: runaway nesting, absurd strings, a repeat block
 * with ten thousand children. */
function walk(value, depth, counter) {
  if (depth > LIMITS.depth) throw new Refused('The submission is nested too deeply.');
  if (typeof value === 'string') {
    if (value.length > LIMITS.stringLength) throw new Refused('One of the answers is too long.');
    counter.n += 1;
  } else if (Array.isArray(value)) {
    if (value.length > LIMITS.arrayLength) throw new Refused('Too many entries in one section.');
    value.forEach((v) => walk(v, depth + 1, counter));
  } else if (isPlainObject(value)) {
    for (const k of Object.keys(value)) walk(value[k], depth + 1, counter);
  } else if (typeof value === 'number' || typeof value === 'boolean' || value === null) {
    counter.n += 1;
  } else {
    throw new Refused('The submission contains a value we do not understand.');
  }
  if (counter.n > LIMITS.fields) throw new Refused('The submission has too many answers.');
}

/* Finds every signature block wherever it sits in the answers, so this keeps
 * working when a later form puts one under a participant or a sponsor. */
export function findSignatures(data, path = []) {
  const found = [];
  if (!isPlainObject(data)) return found;
  if (typeof data.typedName === 'string' && 'intentToSign' in data) {
    found.push({ path: path.join('.'), value: data });
    return found;
  }
  for (const key of Object.keys(data)) {
    const child = data[key];
    if (Array.isArray(child)) {
      child.forEach((item, i) => found.push(...findSignatures(item, [...path, key, String(i)])));
    } else if (isPlainObject(child)) {
      found.push(...findSignatures(child, [...path, key]));
    }
  }
  return found;
}

function checkSignature(sig) {
  const name = String(sig.typedName || '').trim();
  if (name.length < 2) throw new Refused('The form was not signed.');
  if (sig.intentToSign !== true) throw new Refused('The signer did not confirm intent to sign.');
  if (sig.electronicRecordsConsent !== true) {
    throw new Refused('The signer did not consent to electronic records.');
  }
}

export function guard(payload, rawBodyLength) {
  if (rawBodyLength > LIMITS.body) throw new Refused('That submission is too large.', 413);
  if (!isPlainObject(payload)) throw new Refused('We could not read that submission.');

  const formId = String(payload.formId || '');
  if (!FORM_IDS.has(formId)) throw new Refused('That form is not one we accept.');

  /* The browser refuses to send when the hidden field is filled, but a script
   * posting straight here never runs that code, so the value is carried in the
   * payload and checked again. Same reasoning as the timing check below. */
  if (typeof payload.website === 'string' && payload.website.trim() !== '') {
    throw new Refused('That submission did not look like it came from a person.');
  }

  if (!isPlainObject(payload.data)) throw new Refused('The submission had no answers.');
  if (!isPlainObject(payload.labels)) throw new Refused('The submission had no field labels.');

  // Same threshold the browser uses. A bot that posts straight to the endpoint
  // skips the client check, so it gets applied again here.
  const elapsed = Number(payload.elapsedMs);
  if (!Number.isFinite(elapsed) || elapsed < LIMITS.minElapsedMs) {
    throw new Refused('That submission came in too fast to be real.');
  }

  walk(payload.data, 0, { n: 0 });

  const signatures = findSignatures(payload.data);
  if (!signatures.length) throw new Refused('The form was not signed.');
  signatures.forEach((s) => checkSignature(s.value));

  return { formId, signatures };
}

export { LIMITS };
