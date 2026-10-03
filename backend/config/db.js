const { Pool } = require('pg');
const path = require('path');

require('dotenv').config({
  path: path.join(__dirname, '..', '..', '.env')
});

const REQUIRED_ENV = ['DB_NAME', 'DB_USER', 'DB_PASSWORD'];
const missing = REQUIRED_ENV.filter((k) => !process.env[k]);

if (missing.length > 0) {
  console.warn(
    `[db] WARNING: Missing env vars: ${missing.join(', ')}. ` +
    `Falling back to defaults for ${missing.join(', ')}. ` +
    `Set these in .env for production.`
  );
}

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || 'medidiag',
  user: process.env.DB_USER || 'postgres',
  // NO hardcoded real-looking password. Empty default only.
  password: process.env.DB_PASSWORD || '',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('connect', () => {
  console.log('✅ Connected to PostgreSQL database:', process.env.DB_NAME || 'medidiag');
});

pool.on('error', (err) => {
  console.error('❌ Database connection error:', err.message);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
};