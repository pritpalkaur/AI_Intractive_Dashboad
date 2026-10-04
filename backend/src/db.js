// SQL Server access for dbo.Products. Connection settings come from .env (see .env.example).
const sql = require('mssql');

const pool = new sql.ConnectionPool({
  server: process.env.DB_SERVER,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  options: { encrypt: false, trustServerCertificate: true },
});

const toItem = r => ({
  id: r.Id,
  label: r.Name,
  value: Number(r.Price),
  isUpdated: Boolean(r.IsUpdated),
  updatedAt: r.UpdatedAt ? r.UpdatedAt.toISOString() : null,
});

async function readProducts() {
  const result = await pool.request()
    .query('SELECT Id, Name, Price, IsUpdated, UpdatedAt FROM dbo.Products ORDER BY Id');
  return result.recordset.map(toItem);
}

// Updates the price of each item and sets the update flag, all-or-nothing.
// Returns [{ id, label, oldValue, newValue }] for the rows that were written.
async function saveProducts(items) {
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    const changes = [];
    for (const it of items) {
      const result = await new sql.Request(tx)
        .input('id', sql.Int, it.id)
        .input('price', sql.Decimal(10, 2), it.value)
        .query(`SELECT Name, Price FROM dbo.Products WITH (UPDLOCK) WHERE Id = @id;
                UPDATE dbo.Products
                SET Price = @price, IsUpdated = 1, UpdatedAt = SYSUTCDATETIME()
                WHERE Id = @id;`);
      const row = result.recordset[0];
      if (!row) throw new Error(`Product "${it.label}" (id ${it.id}) no longer exists`);
      changes.push({ id: it.id, label: row.Name, oldValue: Number(row.Price), newValue: it.value });
    }
    await tx.commit();
    return changes;
  } catch (err) {
    await tx.rollback();
    throw err;
  }
}

const toUser = r => ({ id: r.Id, email: r.Email, name: r.Name, passwordHash: r.PasswordHash });

async function findUserByEmail(email) {
  const result = await pool.request()
    .input('email', sql.NVarChar(254), email)
    .query('SELECT Id, Email, Name, PasswordHash FROM dbo.Users WHERE Email = @email');
  return result.recordset[0] ? toUser(result.recordset[0]) : null;
}

// Throws an error with code 'DUPLICATE_EMAIL' if the email is already registered.
async function createUser({ email, name, passwordHash }) {
  try {
    const result = await pool.request()
      .input('email', sql.NVarChar(254), email)
      .input('name', sql.NVarChar(100), name)
      .input('hash', sql.NVarChar(100), passwordHash)
      .query(`INSERT INTO dbo.Users (Email, Name, PasswordHash) VALUES (@email, @name, @hash);
              SELECT CAST(SCOPE_IDENTITY() AS INT) AS Id;`);
    return { id: result.recordset[0].Id, email, name };
  } catch (err) {
    if (err.number === 2627 || err.number === 2601) { // unique constraint violation
      throw Object.assign(new Error(`A user with email ${email} already exists`), { code: 'DUPLICATE_EMAIL' });
    }
    throw err;
  }
}

module.exports = { pool, readProducts, saveProducts, findUserByEmail, createUser };
