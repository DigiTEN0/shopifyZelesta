// Applies schema.sql against the configured database.
// Idempotent — every statement uses IF NOT EXISTS, so this is safe to run on
// every deploy (Railway runs it as part of the start command).
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from './pool.js';
import config from '../config/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function migrate() {
  if (!config.db.url) {
    console.warn('[migrate] DATABASE_URL is not set — skipping migration.');
    process.exit(0);
  }
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  console.log('[migrate] Applying schema…');
  try {
    await pool.query(sql);
    console.log('[migrate] Schema applied successfully.');
    process.exit(0);
  } catch (err) {
    console.error('[migrate] Failed:', err.message);
    process.exit(1);
  }
}

migrate();
