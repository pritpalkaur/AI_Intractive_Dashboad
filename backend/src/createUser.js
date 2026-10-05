// Creates a login account and emails the user a welcome message.
// Usage: npm run create-user -- --email someone@gmail.com --name "Some One" --password "secret123"
const { parseArgs } = require('node:util');
const { pool, createUser } = require('./db');
const { hashPassword } = require('./auth');
const { sendWelcomeEmail } = require('./mailer');
const { validateNewUser } = require('./validate');

const USAGE = 'Usage: npm run create-user -- --email someone@gmail.com --name "Some One" --password "secret123"';

(async () => {
  const { values } = parseArgs({
    options: { email: { type: 'string' }, name: { type: 'string' }, password: { type: 'string' } },
  });
  let email, name, password;
  try {
    ({ email, name, password } = validateNewUser(values));
  } catch (err) {
    throw new Error(`${err.message}.\n${USAGE}`);
  }

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
