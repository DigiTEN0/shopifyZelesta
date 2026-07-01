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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const app = express();
app.set('trust proxy', 1);

// ── Webhooks need the RAW body for HMAC, so mount BEFORE json parsing ──
app.use('/webhooks', express.raw({ type: '*/*' }), webhooksRouter);

// ── Standard parsers ──────────────────────────────────────────
app.use(express.json({ limit: '256kb' }));
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
      res.setHeader('Cache-Control', 'public, max-age=300');
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
  a{display:inline-block;margin-top:18px;padding:12px 22px;background:#6366F1;color:#fff;border-radius:10px;text-decoration:none;font-weight:600}</style></head>
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

app.listen(config.port, () => {
  console.log(`\n  Bundle Widget app running on ${config.appUrl}`);
  console.log(`  • Demo:      ${config.appUrl}/demo`);
  console.log(`  • Install:   ${config.appUrl}/install?shop=your-store.myshopify.com`);
  console.log(`  • Health:    ${config.appUrl}/healthz\n`);
});

export default app;
