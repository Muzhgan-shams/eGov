// src/db.js
const { Pool } = require('pg');

const {
  DATABASE_URL,            // preferred in Render
  PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD, // local fallback
  NODE_ENV
} = process.env;

let pool;

if (DATABASE_URL) {
  // Render / any cloud Postgres via single URL
  pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }   // important for external PG over TLS
  });
} else {
  // Local dev 
  pool = new Pool({
    host: PGHOST || 'localhost',
    port: +(PGPORT || 5432),
    database: PGDATABASE || 'eGov',
    user: PGUSER || 'postgres',
    password: PGPASSWORD || '',
    ssl: false
  });
}

module.exports = {
  pool,
  query: (text, params) => pool.query(text, params),
};
