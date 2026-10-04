// Creates a login account and emails the user a welcome message.
// Usage: npm run create-user -- --email someone@gmail.com --name "Some One" --password "secret123"
const { parseArgs } = require('node:util');
const { pool, createUser } = require('./db');
const { hashPassword, MIN_PASSWORD_LENGTH } = require('./auth');
const { sendWelcomeEmail } = require('./mailer');
const { normalizeEmail, isValidEmail } = require('./validate');

const USAGE = 'Usage: npm run create-user -- --email someone@gmail.com --name "Some One" --password "secret123"';

(async () => {
  const { values } = parseArgs({
    options: { email: { type: 'string' }, name: { type: 'string' }, password: { type: 'string' } },
  });
  const email = normalizeEmail(values.email);
  const name = (values.name || '').trim();
  const password = values.password || '';

  if (!isValidEmail(email)) throw new Error(`A valid --email is required.\n${USAGE}`);
  if (!name || name.length > 100) throw new Error(`--name is required (max 100 characters).\n${USAGE}`);
  if (password.length < MIN_PASSWORD_LENGTH) throw new Error(`--password must be at least ${MIN_PASSWORD_LENGTH} characters.\n${USAGE}`);

  await pool.connect();
  const user = await createUser({ email, name, passwordHash: await hashPassword(password) });
  console.log(`Created user #${user.id}: ${user.name} <${user.email}>`);

  try {
    const { sent } = await sendWelcomeEmail(user, process.env.APP_URL || 'http://localhost:3000');
    console.log(sent ? `Welcome email sent to ${user.email}` : 'Welcome email not sent: SMTP is not configured (printed above)');
  } catch (err) {
    console.error(`User was created, but the welcome email failed: ${err.message}`);
    process.exitCode = 1;
  }
  await pool.close();
})().catch(async err => {
  console.error(err.message);
  await pool.close().catch(() => {});
  process.exit(1);
});
