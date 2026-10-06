const { createApp } = require('./app');
const {
  pool, readProducts, saveProducts, findUserByEmail, createUser, createPasswordReset, resetPassword,
} = require('./db');
const { sendSaveEmail, sendWelcomeEmail, sendPasswordResetEmail, sendPasswordChangedEmail } = require('./mailer');
const { createAgent } = require('./agent');

const PORT = process.env.PORT || 5000;

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  console.error('JWT_SECRET in .env must be at least 32 characters (see .env.example)');
  process.exit(1);
}

const app = createApp({
  readProducts,
  saveProducts,
  findUserByEmail,
  createUser,
  createPasswordReset,
  resetPassword,
  sendSaveEmail,
  sendWelcomeEmail,
  sendPasswordResetEmail,
  sendPasswordChangedEmail,
  agent: createAgent({ apiKey: process.env.ANTHROPIC_API_KEY }),
  appUrl: process.env.APP_URL || 'http://localhost:3000',
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
});

pool.connect()
  .then(() => {
    console.log(`Connected to SQL Server ${process.env.DB_SERVER} / ${process.env.DB_NAME}`);
    app.listen(PORT, () => console.log(`API running at http://localhost:${PORT}`));
    console.log(process.env.ANTHROPIC_API_KEY ? 'AI assistant is on' : 'AI assistant is off (ANTHROPIC_API_KEY is not set)');
  })
  .catch(err => {
    console.error(`Could not connect to SQL Server: ${err.message}`);
    process.exit(1);
  });
