/* The contact endpoint that replaced Formspree.
 *
 * Delivery is stubbed, because what is worth checking here is what the handler
 * refuses and what it puts in the email, not whether Resend works.
 */

const ORIGIN = 'https://ukccatholic.org';
process.env.ALLOWED_ORIGINS = ORIGIN;
process.env.RESEND_API_KEY = 're_test_key';
process.env.MAIL_FROM = 'Upper Kittitas Catholic <forms@forms.ukccatholic.org>';
process.env.FINGERPRINT_SECRET = 'test-secret';
delete process.env.AzureWebJobsStorage;

const sent = [];
const invites = [];
let brevoAnswers = { ok: true, status: 201, body: '' };
globalThis.fetch = async (url, init) => {
  if (String(url).includes('brevo.com')) {
    invites.push(JSON.parse(init.body));
    return {
      ok: brevoAnswers.ok,
      status: brevoAnswers.status,
      json: async () => ({}),
      text: async () => brevoAnswers.body,
    };
  }
  sent.push(JSON.parse(init.body));
  return { ok: true, status: 200, json: async () => ({ id: 'stub' }), text: async () => '' };
};

const { contactHandler } = await import('../src/functions/contact.js');

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass });
  console.log(`${pass ? 'ok  ' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
};

const ctx = { log: () => {}, error: () => {} };
const req = (body, method = 'POST', headers = {}) => ({
  method,
  headers: new Headers({ origin: ORIGIN, ...headers }),
  text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
});
const post = (body, headers) => contactHandler(req(body, 'POST', headers), ctx);

const good = {
  kind: 'contact',
  subject: 'New contact: Prayer request from Maria',
  website: '',
  elapsedMs: 20000,
  fields: {
    Name: 'Maria Delgado',
    Email: 'maria@example.com',
    Reason: 'Prayer request',
    Message: 'Please pray for my mother.',
    Confidentiality: 'Shared only with Father and the parish office',
  },
};

// --- the happy path ------------------------------------------------------
sent.length = 0;
const ok = await post(good);
check('a real message is accepted', ok.status === 200, String(ok.status));
check('exactly one email is sent', sent.length === 1, String(sent.length));
check('it goes to the parish office', (sent[0]?.to || []).includes('parish@ukccatholic.org'),
  JSON.stringify(sent[0]?.to));
check('the office can reply straight to the sender', sent[0]?.reply_to === 'maria@example.com',
  sent[0]?.reply_to);
check('the subject survives', sent[0]?.subject === good.subject, sent[0]?.subject);
check('the message body is in the email', /Please pray for my mother/.test(sent[0]?.html || ''));
check('the confidentiality note is carried through',
  /shared only with Father/i.test(sent[0]?.html || ''));
check('no pdf is attached to a contact message', !sent[0]?.attachments);

// --- escaping ------------------------------------------------------------
sent.length = 0;
await post({ ...good, fields: { ...good.fields, Message: '<script>alert(1)</script>' } });
check('markup in a message is escaped, not rendered',
  !/<script>alert/.test(sent[0]?.html || '') && /&lt;script&gt;/.test(sent[0]?.html || ''));

// --- what it refuses -----------------------------------------------------
sent.length = 0;
check('a filled honeypot is refused', (await post({ ...good, website: 'x' })).status === 400);
check('a message that came in too fast is refused',
  (await post({ ...good, elapsedMs: 400 })).status === 400);
check('an unknown kind is refused', (await post({ ...good, kind: 'whatever' })).status === 400);
check('an empty message is refused', (await post({ ...good, fields: {} })).status === 400);
check('unreadable json is refused', (await post('{not json')).status === 400);
check('a novel-length answer is refused',
  (await post({ ...good, fields: { Message: 'x'.repeat(5000) } })).status === 400);
check('a field list that goes on forever is refused',
  (await post({
    ...good,
    fields: Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`f${i}`, 'v'])),
  })).status === 400);
check('nothing was sent for any of those', sent.length === 0, String(sent.length));

// --- signup --------------------------------------------------------------
sent.length = 0;
const signup = await post({
  kind: 'signup',
  subject: 'Email signup: someone@example.com',
  website: '',
  elapsedMs: 9000,
  fields: { Email: 'someone@example.com', Subscriptions: 'Weekly bulletin' },
});
check('a signup is accepted', signup.status === 200, String(signup.status));
check('the signup email is titled as one', /Email list signup/.test(sent[0]?.html || ''));
check('with no list configured, nothing is sent to brevo', invites.length === 0);

// --- signup, once a brevo list exists ------------------------------------
process.env.BREVO_API_KEY = 'xkeysib-test';
process.env.BREVO_LIST_ID = '7';
process.env.BREVO_DOI_TEMPLATE_ID = '3';

const joining = {
  kind: 'signup',
  subject: 'Email signup: someone@example.com',
  website: '',
  elapsedMs: 9000,
  fields: {
    Email: 'someone@example.com',
    Parish: 'Immaculate Conception (Roslyn)',
    Subscriptions: 'Weekly bulletin, Holy-day reminders',
  },
};

sent.length = 0;
invites.length = 0;
const joined = await post(joining);
check('a signup is accepted', joined.status === 200, String(joined.status));
check('it is handed to brevo', invites.length === 1, String(invites.length));
check('brevo gets the address', invites[0]?.email === 'someone@example.com', invites[0]?.email);
check('it joins the parish list', JSON.stringify(invites[0]?.includeListIds) === '[7]');
check('the confirmation email is the one we built', invites[0]?.templateId === 3);
check('the boxes they ticked come through as attributes',
  invites[0]?.attributes?.WEEKLY_BULLETIN === true
  && invites[0]?.attributes?.HOLY_DAY_REMINDERS === true);
check('a box they left alone is recorded as declined, not omitted',
  invites[0]?.attributes?.QUARTERLY_NEWSLETTER === false);
check('the parish arrives as a segment code, not a display name',
  invites[0]?.attributes?.PARISH === 'IC', invites[0]?.attributes?.PARISH);
check('the office inbox is left out of it', sent.length === 0, String(sent.length));

// The footer preselects a parish, but the hosted form and CSV imports need not,
// and the endpoint is public. A missing parish stays missing.
invites.length = 0;
await post({ ...joining, fields: { Email: 'nobody@example.com', Subscriptions: 'Weekly bulletin' } });
check('a signup with no parish still joins the list', invites.length === 1);
check('and leaves the parish unset rather than guessing',
  !('PARISH' in (invites[0]?.attributes || {})));

// Brevo answers 400 to an address already on the list. To the person that is a
// success, so it must not read as an error or land in the office inbox.
sent.length = 0;
invites.length = 0;
brevoAnswers = { ok: false, status: 400, body: '{"code":"duplicate_parameter"}' };
const again = await post(joining);
check('signing up twice still thanks the person', again.status === 200, String(again.status));
check('and does not bother the office', sent.length === 0, String(sent.length));

// Losing an address because Brevo had a bad day is the one outcome worth
// avoiding, so it falls back to the mailbox.
sent.length = 0;
brevoAnswers = { ok: false, status: 500, body: 'upstream on fire' };
const degraded = await post(joining);
check('a brevo outage still accepts the signup', degraded.status === 200, String(degraded.status));
check('the address goes to the office instead', sent.length === 1, String(sent.length));
check('the office is told it needs adding by hand',
  /adding in Brevo by hand/.test(sent[0]?.html || ''));

sent.length = 0;
invites.length = 0;
brevoAnswers = { ok: true, status: 201, body: '' };
await post(good);
check('a contact message never touches the mailing list', invites.length === 0);
check('and still reaches the office', sent.length === 1, String(sent.length));

delete process.env.BREVO_API_KEY;
delete process.env.BREVO_LIST_ID;
delete process.env.BREVO_DOI_TEMPLATE_ID;

// --- cors ----------------------------------------------------------------
const pre = await contactHandler(req('', 'OPTIONS'), ctx);
check('a preflight is answered', pre.status === 204);
check('a preflight allows the parish site',
  pre.headers['Access-Control-Allow-Origin'] === ORIGIN);
const stranger = await contactHandler(req('', 'OPTIONS', { origin: 'https://evil.example' }), ctx);
check('an origin we do not know gets no allow header',
  !('Access-Control-Allow-Origin' in stranger.headers));

// --- delivery not configured --------------------------------------------
delete process.env.RESEND_API_KEY;
const undeliverable = await post(good);
check('a message it cannot deliver is refused, not silently dropped',
  undeliverable.status === 503, String(undeliverable.status));

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
