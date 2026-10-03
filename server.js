// Interactive dashboard server: serves the UI and reads/writes product prices in SQL Server.
// Connection settings come from .env (see .env.example).
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const sql = require('mssql');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const MAX_PRICE = 99999999.99; // dbo.Products.Price is decimal(10,2)

const pool = new sql.ConnectionPool({
  server: process.env.DB_SERVER,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  options: { encrypt: false, trustServerCertificate: true },
});

async function readData() {
  const result = await pool.request().query('SELECT Id, Name, Price FROM dbo.Products ORDER BY Id');
  return { data: result.recordset.map(r => ({ id: r.Id, label: r.Name, value: Number(r.Price) })) };
}

// Updates only the Price column for the given product ids, all-or-nothing.
async function writeData(items) {
  if (!Array.isArray(items) || items.length === 0) throw new Error('Data must be a non-empty array');
  for (const it of items) {
    if (!Number.isInteger(it.id)) throw new Error('Every item needs a numeric id');
    if (typeof it.value !== 'number' || !Number.isFinite(it.value)) throw new Error(`Invalid price for "${it.label}"`);
    if (it.value < 0 || it.value > MAX_PRICE) throw new Error(`Price for "${it.label}" must be between 0 and ${MAX_PRICE}`);
  }

  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    for (const it of items) {
      const result = await new sql.Request(tx)
        .input('id', sql.Int, it.id)
        .input('price', sql.Decimal(10, 2), Math.round(it.value * 100) / 100)
        .query('UPDATE dbo.Products SET Price = @price WHERE Id = @id');
      if (result.rowsAffected[0] !== 1) throw new Error(`Product "${it.label}" (id ${it.id}) no longer exists`);
    }
    await tx.commit();
  } catch (err) {
    await tx.rollback();
    throw err;
  }
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

const server = http.createServer(async (req, res) => {
  if (req.url === '/api/data' && req.method === 'GET') {
    try {
      return sendJson(res, 200, await readData());
    } catch (err) {
      console.error(err);
      return sendJson(res, 500, { ok: false, error: 'Could not read from database' });
    }
  }

  if (req.url === '/api/data' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 1e6) req.destroy(); });
    req.on('end', async () => {
      try {
        await writeData(JSON.parse(body).data);
        sendJson(res, 200, { ok: true, savedAt: new Date().toISOString(), ...(await readData()) });
      } catch (err) {
        sendJson(res, 400, { ok: false, error: err.message });
      }
    });
    return;
  }

  // Static files
  const urlPath = req.url === '/' ? '/index.html' : req.url.split('?')[0];
  const filePath = path.normalize(path.join(PUBLIC_DIR, urlPath));
  if (!filePath.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end(); }
  fs.readFile(filePath, (err, content) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    res.end(content);
  });
});

pool.connect()
  .then(() => {
    console.log(`Connected to SQL Server ${process.env.DB_SERVER} / ${process.env.DB_NAME}`);
    server.listen(PORT, () => console.log(`Dashboard running at http://localhost:${PORT}`));
  })
  .catch(err => {
    console.error(`Could not connect to SQL Server: ${err.message}`);
    process.exit(1);
  });
