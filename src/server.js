import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

import config from './config/index.js';
import authRouter from './routes/auth.js';
import apiRouter from './routes/api.js';
import webhooksRouter from './routes/webhooks.js';
import { confirmBilling } from './services/billingService.js';
import { normalizeShop } from './lib/shopDomain.js';
import { applySchema } from './db/migrate.js';
import { purgeOldVisitorData } from './services/visitorService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const app = express();
app.set('trust proxy', 1);

// Baseline security headers on every response. (frame-ancestors for the
// embedded dashboard is set separately below — Shopify must be able to frame us.)
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// Refuse to run silently with dev crypto defaults in production: tokens would
// be encrypted with a publicly-known key. Loud banner (not a crash, so an
// existing deployment keeps serving while the operator fixes the env).
if (config.env === 'production') {
  if (config.security.tokenEncryptionKey === '0'.repeat(64)) {
    console.error(
      '\n[SECURITY] TOKEN_ENCRYPTION_KEY is not set! Access tokens are encrypted with a KNOWN default key.\n' +
      '[SECURITY] Fix now: openssl rand -hex 32 -> set TOKEN_ENCRYPTION_KEY on the host, redeploy,\n' +
      '[SECURITY] then reinstall the app on each shop so tokens are re-stored under the new key.\n'
    );
  }
  if (config.security.sessionSecret === 'dev-insecure-session-secret') {
    console.error('[SECURITY] SESSION_SECRET is not set — using the insecure dev default. Set a random secret.');
  }
}

// ── Webhooks need the RAW body for HMAC, so mount BEFORE json parsing ──
app.use('/webhooks', express.raw({ type: '*/*' }), webhooksRouter);

// ── Standard parsers ──────────────────────────────────────────
// Also parse text/plain as JSON: the storefront tracking beacon
// (navigator.sendBeacon) must use a CORS-safelisted content type to avoid a
// preflight it can't perform, so it sends JSON under a text/plain type.
app.use(express.json({ limit: '256kb', type: ['application/json', 'text/plain'] }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser(config.security.sessionSecret));

// ── Health check (Railway) ────────────────────────────────────
app.get('/healthz', (req, res) => res.json({ ok: true, env: config.env }));

// ── Storefront widget (served as static, long-cache + CORS) ───
app.use(
  '/widget',
  express.static(path.join(root, 'widget'), {
    setHeaders: (res) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      // Always revalidate so a fresh deploy of the widget shows up immediately
      // (no stale 5-minute cache while iterating). ETag still yields cheap 304s.
      res.setHeader('Cache-Control', 'no-cache, max-age=0, must-revalidate');
    },
  })
);

// ── Standalone demo (no Shopify needed) ───────────────────────
app.get('/demo', (req, res) => {
  res.sendFile(path.join(root, 'demo', 'index.html'));
});
app.use('/demo', express.static(path.join(root, 'demo')));

// ── OAuth / install ───────────────────────────────────────────
app.use('/', authRouter);

// ── API ───────────────────────────────────────────────────────
app.use('/api', apiRouter);

// ── Billing confirm (Shopify redirects the merchant's browser here) ──
app.get('/billing/confirm', async (req, res) => {
  try {
    const shop = normalizeShop(req.query.shop);
    if (shop && req.query.charge_id) {
      await confirmBilling(shop, req.query.charge_id);
    }
    const params = new URLSearchParams({ billing: 'active' });
    if (shop) params.set('shop', shop);
    if (req.query.host) params.set('host', req.query.host);
    res.redirect(`/?${params.toString()}`);
  } catch (err) {
    console.error('[billing] confirm error:', err.message);
    res.redirect('/?billing=error');
  }
});

// ── Embedded dashboard (React/Polaris build) ──────────────────
// Allow Shopify admin to frame us.
function frameAncestors(req, res, next) {
  const shop = normalizeShop(req.query.shop) || '*.myshopify.com';
  res.setHeader(
    'Content-Security-Policy',
    `frame-ancestors https://${shop} https://admin.shopify.com;`
  );
  next();
}

const dashboardDist = path.join(root, 'dashboard', 'dist');
const hasDashboard = fs.existsSync(path.join(dashboardDist, 'index.html'));

if (hasDashboard) {
  app.use('/assets', express.static(path.join(dashboardDist, 'assets')));
  app.use(express.static(dashboardDist, { index: false }));
}

// SPA entrypoint + catch-all for client-side routing.
app.get(['/', '/dashboard', '/settings', '/customise', '/analytics', '/billing'], frameAncestors, (req, res) => {
  if (hasDashboard) {
    return res.sendFile(path.join(dashboardDist, 'index.html'));
  }
  res.status(200).send(fallbackLanding());
});

// Anything else -> SPA (if built) or 404.
app.get('*', frameAncestors, (req, res) => {
  if (hasDashboard && req.accepts('html')) {
    return res.sendFile(path.join(dashboardDist, 'index.html'));
  }
  res.status(404).json({ error: 'Not found' });
});

// ── Error handler ─────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[error]', err);
  res.status(err.statusCode || 500).json({ error: err.message || 'Internal server error' });
});

function fallbackLanding() {
  return `<!doctype html><html><head><meta charset="utf-8"><title>BundleBoost</title>
  <style>body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#0b0d12;color:#e5e7eb;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0}
  .card{max-width:520px;padding:40px;text-align:center}.card h1{font-size:28px;margin:0 0 12px}.card p{color:#9ca3af;line-height:1.6}
  a{display:inline-block;margin-top:18px;padding:12px 22px;background:#b08968;color:#fff;border-radius:10px;text-decoration:none;font-weight:600}</style></head>
  <body><div class="card"><h1>BundleBoost</h1>
  <p>The dashboard build was not found. Run <code>npm run build</code> to compile the Polaris dashboard, or open the live demo below.</p>
  <a href="/demo">View the demo &rarr;</a></div></body></html>`;
}

// Safety net: never let a stray rejection (e.g. a dropped DB connection) take
// the whole server down. Individual routes still surface their own errors.
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
});

// Apply the DB schema on boot (idempotent). Non-fatal: if the DB is briefly
// unreachable we still start serving — routes surface their own errors.
applySchema().catch((err) => console.error('[migrate] boot migration failed:', err.message));

// Data retention: purge anonymous browsing data past the retention window on
// boot and once a day thereafter. RETENTION_DAYS overrides the 90-day default.
const RETENTION_DAYS = parseInt(process.env.RETENTION_DAYS, 10) || 90;
setTimeout(() => purgeOldVisitorData(RETENTION_DAYS), 30 * 1000).unref();
setInterval(() => purgeOldVisitorData(RETENTION_DAYS), 24 * 60 * 60 * 1000).unref();

app.listen(config.port, () => {
  console.log(`\n  Bundle Widget app running on ${config.appUrl}`);
  console.log(`  • Demo:      ${config.appUrl}/demo`);
  console.log(`  • Install:   ${config.appUrl}/install?shop=your-store.myshopify.com`);
  console.log(`  • Health:    ${config.appUrl}/healthz\n`);
});

export default app;
