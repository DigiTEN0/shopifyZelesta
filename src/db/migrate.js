// Applies schema.sql against the configured database.
// Idempotent — every statement uses IF NOT EXISTS / guarded UPDATEs, so this is
// safe to run on every deploy. The server calls applySchema() on boot, and it
// can also be run directly (`npm run db:migrate`).
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from './pool.js';
import config from '../config/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function applySchema() {
  if (!config.db.url) {
    console.warn('[migrate] DATABASE_URL is not set — skipping migration.');
    return false;
  }
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  console.log('[migrate] Applying schema…');
  await pool.query(sql);
  console.log('[migrate] Schema applied successfully.');
  return true;
}

// Run standalone when invoked directly (node src/db/migrate.js).
const invokedDirectly = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (invokedDirectly) {
  applySchema()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[migrate] Failed:', err.message);
      process.exit(1);
    });
}
