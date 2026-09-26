// Email-provider abstraction: selection rules, the Resend adapter (mocked HTTP), and templates.
// No real email is ever sent and the real Resend service is never contacted.
process.env.NODE_ENV = 'test';

const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const ResendEmailProvider = require('../src/email/providers/ResendEmailProvider');
const templates = require('../src/email/templates');

const KEYS = ['EMAIL_PROVIDER', 'EMAIL_API_KEY', 'EMAIL_FROM', 'NODE_ENV'];
let saved;
let logs;
const orig = { log: console.log, warn: console.warn, error: console.error };

// Fresh module instance each time so the provider cache cannot leak between cases.
const email = () => {
  delete require.cache[require.resolve('../src/email')];
  return require('../src/email');
};

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  for (const k of ['EMAIL_PROVIDER', 'EMAIL_API_KEY', 'EMAIL_FROM']) delete process.env[k];
  logs = [];
  for (const level of ['log', 'warn', 'error']) console[level] = (...a) => logs.push(a.join(' '));
});
afterEach(() => {
  Object.assign(console, orig);
  for (const k of KEYS) if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k];
});

test('default: no email provider - nothing is configured and sending throws instead of pretending', async () => {
  const m = email();
  assert.equal(m.getEmailProvider(), null);
  assert.equal(m.isEmailConfigured(), false);
  await assert.rejects(() => m.sendEmail({ to: 'a@b.co', subject: 's', text: 't' }), /not configured/);
});

test('resend needs BOTH an API key and a from-address; otherwise email stays unavailable', () => {
  process.env.EMAIL_PROVIDER = 'resend';
  assert.equal(email().isEmailConfigured(), false);
  process.env.EMAIL_API_KEY = 're_test_key_value';
  assert.equal(email().isEmailConfigured(), false, 'key alone is not enough');
  assert.ok(!logs.join('\n').includes('re_test_key_value'), 'the key is never logged');
  process.env.EMAIL_FROM = 'SIH26101 <no-reply@example.com>';
  const m = email();
  assert.equal(m.isEmailConfigured(), true);
  assert.equal(m.getEmailProvider().name(), 'resend');
});

test('console and test providers are refused where they do not belong (never in production)', () => {
  process.env.EMAIL_PROVIDER = 'console';
  process.env.NODE_ENV = 'test';
  assert.equal(email().isEmailConfigured(), false, 'console is development-only');
  process.env.NODE_ENV = 'production';
  assert.equal(email().isEmailConfigured(), false, 'console refused in production');
  process.env.EMAIL_PROVIDER = 'test';
  assert.equal(email().isEmailConfigured(), false, 'test outbox refused in production');
  process.env.NODE_ENV = 'development';
  process.env.EMAIL_PROVIDER = 'console';
  assert.equal(email().getEmailProvider().name(), 'console');
  process.env.NODE_ENV = 'test';
  process.env.EMAIL_PROVIDER = 'nonsense';
  assert.equal(email().isEmailConfigured(), false);
});

test('Resend adapter: correct request shape (URL, bearer key, from/to/subject/text/html)', async () => {
  const realFetch = global.fetch;
  let seen;
  global.fetch = async (url, init) => {
    seen = { url, init, body: JSON.parse(init.body) };
    return new Response(JSON.stringify({ id: 'msg_123' }), { status: 200 });
  };
  try {
    const provider = new ResendEmailProvider({ apiKey: 're_secret_key_xyz', from: 'App <no-reply@example.com>' });
    const out = await provider.send({ to: 'user@example.com', subject: 'Hi', text: 'plain', html: '<p>html</p>' });
    assert.equal(out.id, 'msg_123');
  } finally {
    global.fetch = realFetch;
  }
  assert.equal(seen.url, 'https://api.resend.com/emails');
  assert.equal(seen.init.method, 'POST');
  assert.equal(seen.init.headers.Authorization, 'Bearer re_secret_key_xyz');
  assert.deepEqual(seen.body, { from: 'App <no-reply@example.com>', to: ['user@example.com'], subject: 'Hi', text: 'plain', html: '<p>html</p>' });
  assert.ok(seen.init.signal, 'has a timeout');
});

test('Resend adapter: failures are generic - no key, recipient, link or provider text in the error', async () => {
  const realFetch = global.fetch;
  const provider = new ResendEmailProvider({ apiKey: 're_secret_key_xyz', from: 'a@example.com' });
  const msg = { to: 'victim@example.com', subject: 'S', text: 'https://x/reset-password#token=SECRETTOKEN', html: '' };
  try {
    global.fetch = async () => new Response('{"message":"invalid key re_secret_key_xyz for victim@example.com"}', { status: 422 });
    await assert.rejects(() => provider.send(msg), (err) => {
      assert.equal(err.message, 'Email provider returned HTTP 422.');
      return true;
    });
    global.fetch = async () => { throw new TypeError('connect ECONNREFUSED api.resend.com re_secret_key_xyz'); };
    await assert.rejects(() => provider.send(msg), (err) => {
      assert.equal(err.message, 'Email provider request failed.');
      return true;
    });
  } finally {
    global.fetch = realFetch;
  }
  assert.equal(logs.length, 0, 'the adapter logs nothing');
});

test('password-reset template: contains the link and lifetime, escapes HTML in the name', () => {
  const link = 'https://app.example.com/reset-password#token=abc123';
  const t = templates.passwordReset({ name: '<script>alert(1)</script>', link, ttlMinutes: 30 });
  assert.match(t.subject, /Reset your password/);
  assert.ok(t.text.includes(link));
  assert.match(t.text, /30 minutes/);
  assert.ok(t.html.includes(link));
  assert.ok(!t.html.includes('<script>'), 'name is HTML-escaped');
  assert.match(t.text, /did not ask for this/i);
});
