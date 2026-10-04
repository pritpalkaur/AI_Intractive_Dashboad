const { createApp } = require('./app');
const { pool, readProducts, saveProducts, findUserByEmail } = require('./db');
const { sendSaveEmail } = require('./mailer');

const PORT = process.env.PORT || 5000;

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  console.error('JWT_SECRET in .env must be at least 32 characters (see .env.example)');
  process.exit(1);
}

const app = createApp({
  readProducts,
  saveProducts,
  findUserByEmail,
  sendSaveEmail,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
});

pool.connect()
  .then(() => {
    console.log(`Connected to SQL Server ${process.env.DB_SERVER} / ${process.env.DB_NAME}`);
    app.listen(PORT, () => console.log(`API running at http://localhost:${PORT}`));
  })
  .catch(err => {
    console.error(`Could not connect to SQL Server: ${err.message}`);
    process.exit(1);
  });
