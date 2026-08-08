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
globalThis.fetch = async (url, init) => {
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
