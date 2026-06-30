// Runs on postinstall. Creates a local .env from .env.example if none exists,
// so a fresh clone boots without a confusing crash. Never overwrites an
// existing .env, and is a no-op in CI / production where env vars are injected.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..', '..');
const envPath = path.join(root, '.env');
const examplePath = path.join(root, '.env.example');

try {
  if (process.env.CI || process.env.RAILWAY_ENVIRONMENT || process.env.NODE_ENV === 'production') {
    process.exit(0);
  }
  if (!fs.existsSync(envPath) && fs.existsSync(examplePath)) {
    fs.copyFileSync(examplePath, envPath);
    console.log('[setup] Created .env from .env.example — fill in your Shopify credentials.');
  }
} catch (err) {
  // Non-fatal: env can always be provided another way.
  console.warn('[setup] Could not create .env:', err.message);
}
