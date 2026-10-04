// Runs db/migrate.sql: adds IsUpdated/UpdatedAt to dbo.Products and creates dbo.Users.
const fs = require('node:fs');
const path = require('node:path');
const { pool } = require('./db');

(async () => {
  const script = fs.readFileSync(path.join(__dirname, '..', 'db', 'migrate.sql'), 'utf8');
  await pool.connect();
  await pool.request().batch(script);
  console.log('Migration complete: dbo.Products has IsUpdated/UpdatedAt and dbo.Users exists.');
  await pool.close();
})().catch(err => {
  console.error(`Migration failed: ${err.message}`);
  process.exit(1);
});
