
// src/db.js
const { Pool } = require('pg');

const {
  DATABASE_URL,
  PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD,
} = process.env;

let pool;

if (DATABASE_URL) {
  pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
} else {
  pool = new Pool({
    host: PGHOST || 'localhost',
    port: +(PGPORT || 5432),
    database: PGDATABASE || 'eGov',
    user: PGUSER || 'postgres',
    password: PGPASSWORD || '',
    ssl: false,
  });
}

module.exports = {
  pool,
  query: (text, params) => pool.query(text, params),
};
