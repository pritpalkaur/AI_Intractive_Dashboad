// Express routes. Data access and mail are injected so the routes can be tested without SQL Server/SMTP.
const express = require('express');
const swaggerUi = require('swagger-ui-express');
const openapi = require('./openapi');
const {
  validateSaveRequest, validateNewUser, validatePassword, ValidationError, normalizeEmail, isValidEmail,
} = require('./validate');
const { hashPassword, checkPassword, signToken, requireAuth, createResetToken, hashResetToken } = require('./auth');

const RESET_TOKEN_MINUTES = 30;
const FORGOT_PASSWORD_REPLY = 'If an account exists for that email, a password reset link has been sent to it.';

function createApp({
  readProducts, saveProducts, findUserByEmail, createUser, createPasswordReset, resetPassword,
  sendSaveEmail, sendWelcomeEmail, sendPasswordResetEmail, sendPasswordChangedEmail,
  jwtSecret, jwtExpiresIn, appUrl = 'http://localhost:3000',
}) {
  if (!jwtSecret) throw new Error('JWT_SECRET is not set');

  const app = express();
  app.use(express.json({ limit: '1mb' }));

  // API documentation and test page (Swagger UI).
  app.get('/api/openapi.json', (req, res) => res.json(openapi));
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openapi, { swaggerOptions: { persistAuthorization: true } }));

  // Registers a new account, emails a welcome message, and logs the user in (returns a JWT).
  app.post('/api/auth/signup', async (req, res) => {
    let input;
    try {
      input = validateNewUser(req.body);
    } catch (err) {
      return res.status(400).json({ ok: false, error: err.message });
    }

    let user;
    try {
      user = await createUser({ email: input.email, name: input.name, passwordHash: await hashPassword(input.password) });
    } catch (err) {
      if (err.code === 'DUPLICATE_EMAIL') return res.status(409).json({ ok: false, error: 'An account with this email already exists' });
      console.error(err);
      return res.status(500).json({ ok: false, error: 'Could not create account' });
    }

    // The account already exists, so an email problem is reported but does not fail the signup.
    let email;
    try {
      const { sent } = await sendWelcomeEmail(user, appUrl, { selfSignup: true });
      email = { to: user.email, sent, error: sent ? null : 'SMTP is not configured on the server (email logged to console)' };
    } catch (err) {
      console.error(err);
      email = { to: user.email, sent: false, error: `Email failed: ${err.message}` };
    }

    res.status(201).json({ ok: true, token: signToken(user, jwtSecret, jwtExpiresIn), user, email });
  });

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

  // Emails a one-time reset link. The reply is the same whether or not the account exists,
  // so this endpoint cannot be used to find out which emails are registered.
  app.post('/api/auth/forgot-password', async (req, res) => {
    const email = normalizeEmail(req.body?.email);
    if (!isValidEmail(email)) return res.status(400).json({ ok: false, error: 'A valid email is required' });
    try {
      const user = await findUserByEmail(email);
      if (user) {
        const { token, tokenHash } = createResetToken();
        await createPasswordReset(user.id, tokenHash, new Date(Date.now() + RESET_TOKEN_MINUTES * 60 * 1000));
        const resetUrl = `${appUrl.replace(/\/$/, '')}/?reset=${token}`;
        try {
          await sendPasswordResetEmail(user, resetUrl, RESET_TOKEN_MINUTES);
        } catch (err) {
          console.error(`Password reset email to ${user.email} failed:`, err.message);
        }
      }
      res.json({ ok: true, message: FORGOT_PASSWORD_REPLY });
    } catch (err) {
      console.error(err);
      res.status(500).json({ ok: false, error: 'Could not start the password reset' });
    }
  });

  // Sets a new password using the token from the reset email. Each token works once.
  app.post('/api/auth/reset-password', async (req, res) => {
    const token = req.body?.token;
    if (typeof token !== 'string' || !/^[0-9a-f]{64}$/.test(token)) {
      return res.status(400).json({ ok: false, error: 'This reset link is invalid or has expired' });
    }
    let password;
    try {
      password = validatePassword(req.body?.password);
    } catch (err) {
      return res.status(400).json({ ok: false, error: err.message });
    }
    try {
      const user = await resetPassword(hashResetToken(token), await hashPassword(password));
      if (!user) return res.status(400).json({ ok: false, error: 'This reset link is invalid or has expired' });
      sendPasswordChangedEmail(user).catch(err => console.error(`Password changed email to ${user.email} failed:`, err.message));
      res.json({ ok: true, message: 'Your password has been changed. You can now sign in.' });
    } catch (err) {
      console.error(err);
      res.status(500).json({ ok: false, error: 'Could not reset the password' });
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
