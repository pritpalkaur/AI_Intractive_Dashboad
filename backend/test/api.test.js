const test = require('node:test');
const assert = require('node:assert');
const jwt = require('jsonwebtoken');
const { createApp } = require('../src/app');
const { hashPassword } = require('../src/auth');
const { buildSaveEmail, buildWelcomeEmail, buildPasswordResetEmail } = require('../src/mailer');

const SECRET = 'test-secret-that-is-long-enough-for-hs256';
const PASSWORD = 'correct-horse';
let passwordHash;
test.before(async () => { passwordHash = await hashPassword(PASSWORD); });

// Starts the app with in-memory fakes for the database and mailer.
async function start({ mailFails = false } = {}) {
  const products = [
    { id: 1, label: 'Mouse', value: 25, isUpdated: false, updatedAt: null },
    { id: 2, label: 'Keyboard', value: 89, isUpdated: false, updatedAt: null },
  ];
  const users = [{ id: 7, email: 'priti@gmail.com', name: 'Priti', passwordHash }];
  const sent = [];
  const resets = [];
  const app = createApp({
    jwtSecret: SECRET,
    findUserByEmail: async email => users.find(u => u.email === email) || null,
    createUser: async ({ email, name, passwordHash: hash }) => {
      if (users.some(u => u.email === email)) throw Object.assign(new Error('duplicate'), { code: 'DUPLICATE_EMAIL' });
      const user = { id: users.length + 100, email, name, passwordHash: hash };
      users.push(user);
      return { id: user.id, email, name };
    },
    sendWelcomeEmail: async (user, loginUrl, options) => {
      if (mailFails) throw new Error('SMTP down');
      sent.push({ to: user.email, welcome: true, options });
      return { sent: true };
    },
    readProducts: async () => products.map(p => ({ ...p })),
    saveProducts: async items => items.map(it => {
      const p = products.find(x => x.id === it.id);
      if (!p) throw new Error(`Product "${it.label}" (id ${it.id}) no longer exists`);
      const change = { id: p.id, label: p.label, oldValue: p.value, newValue: it.value };
      Object.assign(p, { value: it.value, isUpdated: true, updatedAt: new Date().toISOString() });
      return change;
    }),
    sendSaveEmail: async (to, changes) => {
      if (mailFails) throw new Error('SMTP down');
      sent.push({ to, changes });
      return { sent: true };
    },
    // Mirrors db.createPasswordReset / db.resetPassword.
    createPasswordReset: async (userId, tokenHash, expiresAt) => {
      resets.filter(r => r.userId === userId && !r.used).forEach(r => { r.used = true; });
      resets.push({ userId, tokenHash, expiresAt, used: false });
    },
    resetPassword: async (tokenHash, newHash) => {
      const r = resets.find(x => x.tokenHash === tokenHash && !x.used && x.expiresAt > new Date());
      if (!r) return null;
      r.used = true;
      const u = users.find(x => x.id === r.userId);
      u.passwordHash = newHash;
      return { id: u.id, email: u.email, name: u.name };
    },
    sendPasswordResetEmail: async (user, resetUrl, minutes) => {
      if (mailFails) throw new Error('SMTP down');
      sent.push({ to: user.email, resetUrl, minutes });
      return { sent: true };
    },
    sendPasswordChangedEmail: async user => {
      sent.push({ to: user.email, passwordChanged: true });
      return { sent: true };
    },
  });
  const server = await new Promise(resolve => { const s = app.listen(0, () => resolve(s)); });
  const base = `http://localhost:${server.address().port}`;
  const call = (path, { body, token } = {}) => fetch(base + path, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
    body: body && JSON.stringify(body),
  }).then(async r => ({ status: r.status, body: await r.json() }));
  const login = async () => (await call('/api/auth/login', { body: { email: 'Priti@Gmail.com ', password: PASSWORD } })).body.token;
  return { base, call, login, sent, resets, close: () => server.close() };
}

const resetTokenFrom = mail => new URL(mail.resetUrl).searchParams.get('reset');

test('forgot password emails a reset link that changes the password once', async t => {
  const s = await start(); t.after(s.close);
  const forgot = await s.call('/api/auth/forgot-password', { body: { email: ' PRITI@gmail.com' } });
  assert.strictEqual(forgot.status, 200);
  assert.match(forgot.body.message, /If an account exists/);
  assert.strictEqual(s.sent.length, 1);
  assert.strictEqual(s.sent[0].to, 'priti@gmail.com');
  assert.strictEqual(s.sent[0].minutes, 30);
  assert.match(s.sent[0].resetUrl, /^http:\/\/localhost:3000\/\?reset=[0-9a-f]{64}$/);
  const token = resetTokenFrom(s.sent[0]);
  assert.notStrictEqual(s.resets[0].tokenHash, token); // only the hash is stored

  const reset = await s.call('/api/auth/reset-password', { body: { token, password: 'brand-new-pass' } });
  assert.strictEqual(reset.status, 200);
  assert.deepStrictEqual(s.sent[1], { to: 'priti@gmail.com', passwordChanged: true });

  // New password works, old one does not, and the link cannot be reused.
  assert.strictEqual((await s.call('/api/auth/login', { body: { email: 'priti@gmail.com', password: 'brand-new-pass' } })).status, 200);
  assert.strictEqual((await s.call('/api/auth/login', { body: { email: 'priti@gmail.com', password: PASSWORD } })).status, 401);
  const again = await s.call('/api/auth/reset-password', { body: { token, password: 'another-pass' } });
  assert.strictEqual(again.status, 400);
  assert.match(again.body.error, /invalid or has expired/);
});

test('forgot password gives the same reply for unknown emails and sends nothing', async t => {
  const s = await start(); t.after(s.close);
  const known = await s.call('/api/auth/forgot-password', { body: { email: 'priti@gmail.com' } });
  const unknown = await s.call('/api/auth/forgot-password', { body: { email: 'nobody@gmail.com' } });
  assert.deepStrictEqual(unknown, known);
  assert.strictEqual(s.sent.length, 1);
  assert.strictEqual((await s.call('/api/auth/forgot-password', { body: { email: 'nope' } })).status, 400);
});

test('forgot password still replies OK if the email fails', async t => {
  const s = await start({ mailFails: true }); t.after(s.close);
  const { status, body } = await s.call('/api/auth/forgot-password', { body: { email: 'priti@gmail.com' } });
  assert.strictEqual(status, 200);
  assert.strictEqual(body.ok, true);
});

test('only the newest reset link works', async t => {
  const s = await start(); t.after(s.close);
  await s.call('/api/auth/forgot-password', { body: { email: 'priti@gmail.com' } });
  await s.call('/api/auth/forgot-password', { body: { email: 'priti@gmail.com' } });
  const [first, second] = s.sent.map(resetTokenFrom);
  assert.strictEqual((await s.call('/api/auth/reset-password', { body: { token: first, password: 'brand-new-pass' } })).status, 400);
  assert.strictEqual((await s.call('/api/auth/reset-password', { body: { token: second, password: 'brand-new-pass' } })).status, 200);
});

test('reset password rejects bad tokens, expired tokens and weak passwords', async t => {
  const s = await start(); t.after(s.close);
  await s.call('/api/auth/forgot-password', { body: { email: 'priti@gmail.com' } });
  const token = resetTokenFrom(s.sent[0]);
  for (const body of [
    {},
    { token: 'abc', password: 'brand-new-pass' },
    { token: 'f'.repeat(64), password: 'brand-new-pass' },
    { token, password: 'short' },
    { token, password: 12345678 },
  ]) {
    assert.strictEqual((await s.call('/api/auth/reset-password', { body })).status, 400, JSON.stringify(body));
  }
  s.resets[0].expiresAt = new Date(Date.now() - 1000);
  assert.strictEqual((await s.call('/api/auth/reset-password', { body: { token, password: 'brand-new-pass' } })).status, 400);
  assert.strictEqual((await s.call('/api/auth/login', { body: { email: 'priti@gmail.com', password: PASSWORD } })).status, 200);
});

test('signup creates an account, sends a welcome email and returns a working JWT', async t => {
  const s = await start(); t.after(s.close);
  const { status, body } = await s.call('/api/auth/signup', { body: { email: ' New@Gmail.com', name: ' New User ', password: 'new-password' } });
  assert.strictEqual(status, 201);
  assert.deepStrictEqual(body.user, { id: 101, email: 'new@gmail.com', name: 'New User' });
  assert.deepStrictEqual(body.email, { to: 'new@gmail.com', sent: true, error: null });
  assert.deepStrictEqual(s.sent, [{ to: 'new@gmail.com', welcome: true, options: { selfSignup: true } }]);
  assert.strictEqual((await s.call('/api/products', { token: body.token })).status, 200);

  // The same credentials work with login.
  const login = await s.call('/api/auth/login', { body: { email: 'new@gmail.com', password: 'new-password' } });
  assert.strictEqual(login.status, 200);
  assert.strictEqual(login.body.user.id, 101);
});

test('signup rejects duplicate emails and invalid input', async t => {
  const s = await start(); t.after(s.close);
  const dup = await s.call('/api/auth/signup', { body: { email: 'PRITI@gmail.com', name: 'Someone', password: 'whatever-123' } });
  assert.strictEqual(dup.status, 409);
  for (const bad of [
    {},
    { email: 'not-an-email', name: 'A', password: 'long-enough' },
    { email: 'a@gmail.com', name: '  ', password: 'long-enough' },
    { email: 'a@gmail.com', name: 'x'.repeat(101), password: 'long-enough' },
    { email: 'a@gmail.com', name: 'A', password: 'short' },
    { email: 'a@gmail.com', name: 'A', password: 'x'.repeat(73) },
    { email: 'a@gmail.com', name: 'A', password: 12345678 },
  ]) {
    const { status, body } = await s.call('/api/auth/signup', { body: bad });
    assert.strictEqual(status, 400, JSON.stringify(bad));
    assert.strictEqual(body.ok, false);
  }
  assert.strictEqual(s.sent.length, 0);
});

test('signup succeeds even if the welcome email fails', async t => {
  const s = await start({ mailFails: true }); t.after(s.close);
  const { status, body } = await s.call('/api/auth/signup', { body: { email: 'b@gmail.com', name: 'B', password: 'long-enough' } });
  assert.strictEqual(status, 201);
  assert.ok(body.token);
  assert.strictEqual(body.email.sent, false);
  assert.match(body.email.error, /SMTP down/);
});

test('login returns a JWT for valid credentials', async t => {
  const s = await start(); t.after(s.close);
  const { status, body } = await s.call('/api/auth/login', { body: { email: 'priti@gmail.com', password: PASSWORD } });
  assert.strictEqual(status, 200);
  assert.deepStrictEqual(body.user, { id: 7, email: 'priti@gmail.com', name: 'Priti' });
  const payload = jwt.verify(body.token, SECRET);
  assert.strictEqual(payload.sub, '7');
  assert.strictEqual(payload.email, 'priti@gmail.com');
});

test('login rejects wrong password, unknown user and missing fields', async t => {
  const s = await start(); t.after(s.close);
  assert.strictEqual((await s.call('/api/auth/login', { body: { email: 'priti@gmail.com', password: 'wrong-password' } })).status, 401);
  assert.strictEqual((await s.call('/api/auth/login', { body: { email: 'nobody@gmail.com', password: PASSWORD } })).status, 401);
  assert.strictEqual((await s.call('/api/auth/login', { body: { email: 'priti@gmail.com' } })).status, 400);
});

test('product routes require a valid token', async t => {
  const s = await start(); t.after(s.close);
  const expired = jwt.sign({ email: 'priti@gmail.com' }, SECRET, { subject: '7', expiresIn: -10 });
  const forged = jwt.sign({ email: 'priti@gmail.com' }, 'some-other-secret', { subject: '7' });
  for (const token of [undefined, 'garbage', forged, expired]) {
    assert.strictEqual((await s.call('/api/products', { token })).status, 401);
    assert.strictEqual((await s.call('/api/products/save', { token, body: { data: [{ id: 1, value: 1 }] } })).status, 401);
  }
  assert.match((await s.call('/api/products', { token: expired })).body.error, /expired/);
  assert.strictEqual(s.sent.length, 0);
});

test('GET /api/products returns data when logged in', async t => {
  const s = await start(); t.after(s.close);
  const { status, body } = await s.call('/api/products', { token: await s.login() });
  assert.strictEqual(status, 200);
  assert.strictEqual(body.data.length, 2);
});

test('save updates price, sets flag and emails the logged-in user', async t => {
  const s = await start(); t.after(s.close);
  const { status, body } = await s.call('/api/products/save', {
    token: await s.login(),
    body: { data: [{ id: 2, label: 'Keyboard', value: 79.999 }], email: 'someone-else@example.com' },
  });
  assert.strictEqual(status, 200);
  assert.deepStrictEqual(body.changes, [{ id: 2, label: 'Keyboard', oldValue: 89, newValue: 80 }]);
  const kb = body.data.find(p => p.id === 2);
  assert.strictEqual(kb.value, 80);
  assert.strictEqual(kb.isUpdated, true);
  assert.strictEqual(body.data.find(p => p.id === 1).isUpdated, false);
  assert.deepStrictEqual(body.email, { to: 'priti@gmail.com', sent: true, error: null });
  assert.strictEqual(s.sent[0].to, 'priti@gmail.com'); // not the address in the request body
});

test('email failure does not fail the save', async t => {
  const s = await start({ mailFails: true }); t.after(s.close);
  const { status, body } = await s.call('/api/products/save', { token: await s.login(), body: { data: [{ id: 1, label: 'Mouse', value: 20 }] } });
  assert.strictEqual(status, 200);
  assert.strictEqual(body.email.sent, false);
  assert.match(body.email.error, /SMTP down/);
});

test('rejects invalid save requests', async t => {
  const s = await start(); t.after(s.close);
  const token = await s.login();
  for (const bad of [
    {},
    { data: [] },
    { data: [{ id: 'x', value: 1 }] },
    { data: [{ id: 1, value: -1 }] },
    { data: [{ id: 1, value: 1 }, { id: 1, value: 2 }] },
    { data: [{ id: 99, label: 'Ghost', value: 1 }] },
  ]) {
    const { status, body } = await s.call('/api/products/save', { token, body: bad });
    assert.strictEqual(status, 400, JSON.stringify(bad));
    assert.strictEqual(body.ok, false);
  }
  assert.strictEqual(s.sent.length, 0);
});

test('Swagger UI and OpenAPI spec are served without a token', async t => {
  const s = await start(); t.after(s.close);
  const spec = await s.call('/api/openapi.json');
  assert.strictEqual(spec.status, 200);
  assert.strictEqual(spec.body.openapi, '3.0.3');
  assert.deepStrictEqual(Object.keys(spec.body.paths).sort(), ['/api/auth/forgot-password', '/api/auth/login', '/api/auth/reset-password', '/api/auth/signup', '/api/products', '/api/products/save']);
  const page = await fetch(s.base + '/api/docs/');
  assert.strictEqual(page.status, 200);
  assert.match(await page.text(), /swagger-ui/);
});

test('save email lists old and new prices and escapes HTML', () => {
  const mail = buildSaveEmail([{ id: 1, label: '<b>Mouse</b>', oldValue: 25, newValue: 20 }], '2026-10-04T00:00:00Z');
  assert.match(mail.subject, /1 price updated/);
  assert.match(mail.text, /<b>Mouse<\/b>: 25\.00 -> 20\.00/);
  assert.match(mail.html, /&lt;b&gt;Mouse&lt;\/b&gt;/);
});

test('welcome email has login details but no password', () => {
  const mail = buildWelcomeEmail({ email: 'priti@gmail.com', name: '<Priti>' }, 'http://localhost:3000');
  assert.match(mail.text, /Login email: priti@gmail\.com/);
  assert.match(mail.text, /http:\/\/localhost:3000/);
  assert.match(mail.html, /&lt;Priti&gt;/);
  assert.doesNotMatch(mail.text, /correct-horse/);
});

test('self-signup welcome email does not say the password will be sent separately', () => {
  const mail = buildWelcomeEmail({ email: 'a@gmail.com', name: 'A' }, 'http://localhost:3000', { selfSignup: true });
  assert.match(mail.text, /Thanks for signing up/);
  assert.match(mail.text, /password you chose/);
  assert.doesNotMatch(mail.text, /given to you separately/);
});

test('password reset email has the link and expiry and escapes HTML', () => {
  const mail = buildPasswordResetEmail({ name: '<A>' }, 'http://localhost:3000/?reset=abc', 30);
  assert.match(mail.text, /http:\/\/localhost:3000\/\?reset=abc/);
  assert.match(mail.text, /expires in 30 minutes/);
  assert.match(mail.html, /&lt;A&gt;/);
});
