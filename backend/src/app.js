// Express routes. Data access and mail are injected so the routes can be tested without SQL Server/SMTP.
const express = require('express');
const { validateSaveRequest, ValidationError, normalizeEmail } = require('./validate');
const { checkPassword, signToken, requireAuth } = require('./auth');

function createApp({ readProducts, saveProducts, findUserByEmail, sendSaveEmail, jwtSecret, jwtExpiresIn }) {
  if (!jwtSecret) throw new Error('JWT_SECRET is not set');

  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.post('/api/auth/login', async (req, res) => {
    const email = normalizeEmail(req.body?.email);
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!email || !password) return res.status(400).json({ ok: false, error: 'Email and password are required' });
    try {
      const user = await checkPassword(await findUserByEmail(email), password);
      if (!user) return res.status(401).json({ ok: false, error: 'Incorrect email or password' });
      res.json({
        ok: true,
        token: signToken(user, jwtSecret, jwtExpiresIn),
        user: { id: user.id, email: user.email, name: user.name },
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ ok: false, error: 'Could not log in' });
    }
  });

  // Everything below requires a valid JWT.
  app.use('/api/products', requireAuth(jwtSecret));

  app.get('/api/products', async (req, res) => {
    try {
      res.json({ ok: true, data: await readProducts() });
    } catch (err) {
      console.error(err);
      res.status(500).json({ ok: false, error: 'Could not read from database' });
    }
  });

  // Saves only the changed prices sent by the client, flags them as updated,
  // then emails a summary to the logged-in user.
  app.post('/api/products/save', async (req, res) => {
    let request;
    try {
      request = validateSaveRequest(req.body);
    } catch (err) {
      return res.status(400).json({ ok: false, error: err.message });
    }

    let changes;
    try {
      changes = await saveProducts(request.items);
    } catch (err) {
      console.error(err);
      const status = err instanceof ValidationError || /no longer exists/.test(err.message) ? 400 : 500;
      return res.status(status).json({ ok: false, error: status === 400 ? err.message : 'Could not save to database' });
    }

    const savedAt = new Date().toISOString();
    const to = req.user.email;
    // The data is already committed, so an email problem is reported but does not fail the save.
    let email;
    try {
      const { sent } = await sendSaveEmail(to, changes, savedAt);
      email = { to, sent, error: sent ? null : 'SMTP is not configured on the server (email logged to console)' };
    } catch (err) {
      console.error(err);
      email = { to, sent: false, error: `Email failed: ${err.message}` };
    }

    let data;
    try {
      data = await readProducts();
    } catch (err) {
      console.error(err);
    }
    res.json({ ok: true, savedAt, changes, email, data });
  });

  return app;
}

module.exports = { createApp };
