// All /api/* routes. Public storefront endpoints are CORS-enabled and
// shop-validated; admin endpoints require a verified App Bridge session token.
import express from 'express';
import { publicCors } from '../middleware/cors.js';
import { discountRateLimit, publicReadRateLimit } from '../middleware/rateLimit.js';
import { validateShopParam, requireInstalledShop } from '../middleware/validateShop.js';
import { requireInstalledSession } from '../middleware/sessionToken.js';
import { generateBundleDiscount, generateWelcomeDiscount } from '../services/discountService.js';
import { saveLead, createShopifyCustomer, setCustomerId, getLeads, getLeadStats } from '../services/leadsService.js';
import { getSettings, saveSettings, publicSettings } from '../services/settingsService.js';
import { getAnalytics, resolveRange, recordEvent } from '../services/analyticsService.js';
import {
  activateBilling,
  confirmBilling,
  getUsage,
  getFeeHistory,
  getBillingStatus,
} from '../services/billingService.js';
import { getShop, getShopName, getClient } from '../services/shopsService.js';

const router = express.Router();

// The public settings endpoint fires on every storefront pageview, so cache it
// in memory (one small entry per shop) to keep DB load flat under traffic
// spikes. Invalidated immediately when the merchant saves settings.
const publicSettingsCache = new Map(); // shop -> { body, exp }
const PUBLIC_SETTINGS_TTL = 60 * 1000;

// ── PUBLIC (storefront widget) ────────────────────────────────

// Widget config for a shop.
router.get(
  '/settings/:shop',
  publicCors,
  publicReadRateLimit,
  requireInstalledShop,
  async (req, res, next) => {
    try {
      const now = Date.now();
      const cached = publicSettingsCache.get(req.shop);
      if (cached && cached.exp > now) return res.json(cached.body);
      const s = await getSettings(req.shop);
      const [pub, storeName] = [publicSettings(s), await getShopName(req.shop)];
      const body = { settings: { ...pub, storeName: storeName || '' } };
      publicSettingsCache.set(req.shop, { body, exp: now + PUBLIC_SETTINGS_TTL });
      res.json(body);
    } catch (err) {
      next(err);
    }
  }
);

// Mint a unique BUNDLE- discount code for a bundle.
router.post(
  '/discount/generate',
  publicCors,
  discountRateLimit,
  requireInstalledShop,
  async (req, res, next) => {
    try {
      let result;
      try {
        result = await generateBundleDiscount(req.shop, req.body || {});
      } catch (e) {
        // Fewer than 2 products (or below a tier) — fall back to the pop-up
        // welcome discount so a single-product reveal can still check out.
        if (e.statusCode === 422) result = await generateWelcomeDiscount(req.shop, req.body || {});
        else throw e;
      }
      res.json(result);
    } catch (err) {
      if (err.statusCode) {
        return res.status(err.statusCode).json({ error: err.message, details: err.details });
      }
      next(err);
    }
  }
);

// Funnel events from the widget (impressions etc.).
router.post('/events', publicCors, publicReadRateLimit, validateShopParam, async (req, res, next) => {
  try {
    const body = req.body || {};
    const eventType = body.eventType;
    if (!['widget_shown', 'add_to_cart'].includes(eventType)) {
      return res.status(400).json({ error: 'Unknown event type.' });
    }
    await recordEvent(req.shop, {
      sessionId: String(body.sessionId || '').slice(0, 64),
      eventType,
      productIds: (Array.isArray(body.productIds) ? body.productIds : []).slice(0, 50),
      productCount: Math.max(0, Math.min(500, parseInt(body.productCount, 10) || 0)),
      bundleValue: Number(body.bundleValue) || null,
      discountCode: body.discountCode ? String(body.discountCode).slice(0, 64) : null,
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Lead capture from the pop-up: save email + browse intent, mint the right
// discount, push into Shopify Customers, then tell the widget what to reveal.
router.post('/lead', publicCors, discountRateLimit, requireInstalledShop, async (req, res, next) => {
  try {
    const body = req.body || {};
    // Bound every public input so a hostile client can't stuff the database.
    const email = String(body.email || '').trim().slice(0, 320);
    const name = String(body.name || '').trim().slice(0, 120);
    const sessionId = String(body.sessionId || '').slice(0, 64);
    const items = (Array.isArray(body.items) ? body.items : []).slice(0, 20);
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return res.status(422).json({ error: 'A valid email is required.' });
    }

    // The reveal (bundle panel) mints the actual code at checkout for the final
    // composition, so lead capture just records the email + browse intent.
    const mode = items.length >= 2 ? 'bundle' : (items.length === 1 ? 'single' : 'welcome');
    const productIds = items.map((it) => it.productId).filter(Boolean);
    const productTitles = items.map((it) => String(it.title || '').slice(0, 200)).filter(Boolean);
    const productDetails = items
      .filter((it) => it.title)
      .map((it) => ({
        title: String(it.title).slice(0, 200),
        image: String(it.image || '').slice(0, 500),
        url: String(it.url || '').slice(0, 500),
      }));
    await saveLead(req.shop, { email, name, sessionId, productIds, productTitles, productDetails, code: null, mode });

    // Best-effort: push to Shopify Customers (needs write_customers scope).
    createShopifyCustomer(req.shop, { email, name, browsedTitles: productTitles, code: null })
      .then((cid) => cid && setCustomerId(req.shop, email, cid))
      .catch(() => {});

    res.json({ ok: true, mode });
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    next(err);
  }
});

router.options('*', publicCors, (req, res) => res.sendStatus(204));

// ── ADMIN (embedded dashboard, session-token protected) ───────

// Full settings (admin view) + setup checklist data.
router.get('/admin/settings/:shop', requireInstalledSession, async (req, res, next) => {
  try {
    const s = await getSettings(req.shop);
    const shop = await getShop(req.shop);
    res.json({
      settings: s,
      meta: {
        scriptTagInstalled: Boolean(shop?.script_tag_id),
        installedAt: shop?.installed_at,
        storeName: (await getShopName(req.shop)) || '',
      },
    });
  } catch (err) {
    next(err);
  }
});

router.post('/settings/:shop', requireInstalledSession, async (req, res, next) => {
  try {
    const saved = await saveSettings(req.shop, req.body || {});
    publicSettingsCache.delete(req.shop); // reflect changes on the storefront at once
    res.json({ settings: saved });
  } catch (err) {
    next(err);
  }
});

// A few real products from the store, for the dashboard's live preview.
router.get('/preview-products/:shop', requireInstalledSession, async (req, res) => {
  try {
    const client = await getClient(req.shop);
    if (!client) return res.json({ products: [] });
    const data = await client.get('/products.json?limit=12&fields=id,title,handle,images,variants,options');
    res.json({ products: (data.products || []).map(mapAdminProduct).filter((p) => p.image) });
  } catch (err) {
    res.json({ products: [] });
  }
});

function mapAdminProduct(p) {
  const cents = (v) => (v == null ? null : Math.round(parseFloat(v) * 100));
  const first = (p.variants && p.variants[0]) || {};
  return {
    id: p.id,
    handle: p.handle,
    title: p.title,
    url: '/products/' + p.handle,
    image: (p.images && p.images[0] && p.images[0].src) || '',
    price: cents(first.price) || 0,
    compareAtPrice: cents(first.compare_at_price),
    options: (p.options || []).map((o) => ({ name: o.name, values: o.values })),
    variants: (p.variants || []).map((v) => ({
      id: v.id, title: v.title, price: cents(v.price) || 0, compareAtPrice: cents(v.compare_at_price),
      available: v.available !== false, optionValues: [v.option1, v.option2, v.option3].filter((x) => x != null),
    })),
    selectedVariantId: first.id || null,
  };
}

router.get('/leads/:shop', requireInstalledSession, async (req, res, next) => {
  try {
    const [leads, stats] = await Promise.all([getLeads(req.shop), getLeadStats(req.shop)]);
    res.json({ leads, stats });
  } catch (err) {
    next(err);
  }
});

router.get('/analytics/:shop', requireInstalledSession, async (req, res, next) => {
  try {
    const { range = 'this-month', from, to } = req.query;
    const window = resolveRange(range, from, to);
    const data = await getAnalytics(req.shop, window);
    res.json(data);
  } catch (err) {
    next(err);
  }
});

router.post('/billing/activate', requireInstalledSession, async (req, res, next) => {
  try {
    const returnUrl = `${req.protocol}://${req.get('host')}/billing/confirm?shop=${req.shop}`;
    const result = await activateBilling(req.shop, returnUrl);
    res.json(result);
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    next(err);
  }
});

router.get('/billing/usage/:shop', requireInstalledSession, async (req, res, next) => {
  try {
    const [usage, history, status] = await Promise.all([
      getUsage(req.shop, req.query.range || 'this-month'),
      getFeeHistory(req.shop),
      getBillingStatus(req.shop),
    ]);
    res.json({ usage, history, status });
  } catch (err) {
    next(err);
  }
});

// Confirm endpoint Shopify redirects back to after the merchant accepts billing.
router.get('/billing/confirm-callback', requireInstalledSession, async (req, res, next) => {
  try {
    const result = await confirmBilling(req.shop, req.query.charge_id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
