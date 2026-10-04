const test = require('node:test');
const assert = require('node:assert');
const jwt = require('jsonwebtoken');
const { createApp } = require('../src/app');
const { hashPassword } = require('../src/auth');
const { buildSaveEmail, buildWelcomeEmail } = require('../src/mailer');

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
  const app = createApp({
    jwtSecret: SECRET,
    findUserByEmail: async email => users.find(u => u.email === email) || null,
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
  });
  const server = await new Promise(resolve => { const s = app.listen(0, () => resolve(s)); });
  const base = `http://localhost:${server.address().port}`;
  const call = (path, { body, token } = {}) => fetch(base + path, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
    body: body && JSON.stringify(body),
  }).then(async r => ({ status: r.status, body: await r.json() }));
  const login = async () => (await call('/api/auth/login', { body: { email: 'Priti@Gmail.com ', password: PASSWORD } })).body.token;
  return { base, call, login, sent, close: () => server.close() };
}

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
  assert.deepStrictEqual(Object.keys(spec.body.paths).sort(), ['/api/auth/login', '/api/products', '/api/products/save']);
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
