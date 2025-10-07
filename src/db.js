// src/db.js
const { Pool } = require('pg');

const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
  : new Pool({
      host: process.env.PGHOST || 'localhost',
      port: +(process.env.PGPORT || 5432),
      database: process.env.PGDATABASE || 'eGov',
      user: process.env.PGUSER || 'postgres',
      password: process.env.PGPASSWORD || '',
    });

module.exports = {
  pool,
  query: (text, params) => pool.query(text, params),
};
