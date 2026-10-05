// Sends the "data saved" email. Without SMTP_HOST the message is only logged to the console.
const nodemailer = require('nodemailer');

const smtpConfigured = Boolean(process.env.SMTP_HOST);

const transport = smtpConfigured
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined,
    })
  : nodemailer.createTransport({ jsonTransport: true });

const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function buildSaveEmail(changes, savedAt) {
  const when = new Date(savedAt).toUTCString();
  const lines = changes.map(c => `${c.label}: ${c.oldValue.toFixed(2)} -> ${c.newValue.toFixed(2)}`);
  const rows = changes.map(c =>
    `<tr><td>${escapeHtml(c.label)}</td><td>${c.oldValue.toFixed(2)}</td><td><b>${c.newValue.toFixed(2)}</b></td></tr>`);
  return {
    subject: `Dashboard data saved: ${changes.length} price${changes.length === 1 ? '' : 's'} updated`,
    text: `The following prices were saved to the database on ${when}:\n\n${lines.join('\n')}\n`,
    html: `<p>The following prices were saved to the database on ${escapeHtml(when)}:</p>
<table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse">
<thead><tr><th>Product</th><th>Old price</th><th>New price</th></tr></thead>
<tbody>${rows.join('')}</tbody></table>`,
  };
}

// Sent when an account is created. The password is never included.
// selfSignup: true when the user registered themselves (they already know their password).
function buildWelcomeEmail(user, loginUrl, { selfSignup = false } = {}) {
  const intro = selfSignup
    ? 'Thanks for signing up for the Interactive Dashboard. Your account is ready.'
    : 'An account has been created for you on the Interactive Dashboard.';
  const passwordNote = selfSignup
    ? 'Sign in with the password you chose when you signed up.'
    : 'Your password will be given to you separately.';
  return {
    subject: 'Your Interactive Dashboard account',
    text: `Hi ${user.name},\n\n${intro}\n\n`
      + `Login email: ${user.email}\nSign in at: ${loginUrl}\n\n`
      + `${passwordNote}\n`,
    html: `<p>Hi ${escapeHtml(user.name)},</p>
<p>${intro}</p>
<p>Login email: <b>${escapeHtml(user.email)}</b><br>Sign in at: <a href="${escapeHtml(loginUrl)}">${escapeHtml(loginUrl)}</a></p>
<p>${passwordNote}</p>`,
  };
}

async function send(to, message) {
  const info = await transport.sendMail({
    from: process.env.MAIL_FROM || process.env.SMTP_USER || 'dashboard@localhost',
    to,
    ...message,
  });
  if (!smtpConfigured) console.log(`[mail] SMTP not configured, email to ${to} not sent:\n${info.message}`);
  return { sent: smtpConfigured };
}

const sendSaveEmail = (to, changes, savedAt) => send(to, buildSaveEmail(changes, savedAt));
const sendWelcomeEmail = (user, loginUrl, options) => send(user.email, buildWelcomeEmail(user, loginUrl, options));

module.exports = { buildSaveEmail, buildWelcomeEmail, sendSaveEmail, sendWelcomeEmail };
