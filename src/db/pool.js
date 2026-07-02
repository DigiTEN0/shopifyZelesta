import pg from 'pg';
import config from '../config/index.js';

const { Pool } = pg;

// A single shared connection pool for the whole process.
const pool = new Pool({
  connectionString: config.db.url,
  ssl: config.db.ssl ? { rejectUnauthorized: false } : false,
  max: 12,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000, // fail fast instead of hanging a request
  keepAlive: true,                // survive managed-Postgres idle drops
  allowExitOnIdle: false,
});

// A managed Postgres can drop idle connections; pg surfaces that as an 'error'
// on the idle client. Handling it here prevents the process from crashing.
pool.on('error', (err) => {
  console.error('[db] idle client error (recovered):', err.message);
});

export async function query(text, params) {
  return pool.query(text, params);
}

export async function withClient(fn) {
  const client = await pool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

export default pool;
