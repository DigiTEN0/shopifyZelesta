// Shopify Billing API (usage-based) for the Performance plan:
// 0.5% of attributed bundle GMV. Uses a recurring subscription with a usage
// line so we can post monthly usage charges.
import config from '../config/index.js';
import { query } from '../db/pool.js';
import { getClient } from './shopsService.js';
import { getAnalytics, resolveRange } from './analyticsService.js';

const FEE_RATE = config.billing.feeRate; // 0.005
const CAPPED_AMOUNT = 5000; // USD cap on the usage subscription (raise if needed)

export async function activateBilling(shop, returnUrl) {
  const client = await getClient(shop);
  if (!client) {
    const err = new Error('Shop not installed.');
    err.statusCode = 404;
    throw err;
  }

  const payload = {
    recurring_application_charge: {
      name: 'Bundle Widget — Performance Plan',
      price: 0,
      return_url: returnUrl,
      test: config.billing.testMode,
      capped_amount: CAPPED_AMOUNT,
      terms: `0.5% of attributed bundle revenue (orders using BUNDLE- codes). Billed monthly via usage charges.`,
    },
  };

  const res = await client.post('/recurring_application_charges.json', payload);
  const charge = res.recurring_application_charge;

  await query(
    `INSERT INTO billing (shop_domain, subscription_id, status, confirmation_url, updated_at)
     VALUES ($1,$2,'pending',$3, now())
     ON CONFLICT (shop_domain) DO UPDATE
       SET subscription_id = EXCLUDED.subscription_id,
           status = 'pending',
           confirmation_url = EXCLUDED.confirmation_url,
           updated_at = now()`,
    [shop, charge.id, charge.confirmation_url]
  );

  return { confirmationUrl: charge.confirmation_url, chargeId: charge.id };
}

export async function confirmBilling(shop, chargeId) {
  const client = await getClient(shop);
  if (!client) throw new Error('Shop not installed.');

  const res = await client.get(`/recurring_application_charges/${chargeId}.json`);
  const charge = res.recurring_application_charge;

  if (charge.status === 'accepted') {
    // Must activate to start the subscription.
    await client.post(`/recurring_application_charges/${chargeId}/activate.json`, {
      recurring_application_charge: charge,
    });
  }

  const active = charge.status === 'accepted' || charge.status === 'active';
  await query(
    `UPDATE billing SET status = $2, activated_at = CASE WHEN $2='active' THEN now() ELSE activated_at END, updated_at = now()
       WHERE shop_domain = $1`,
    [shop, active ? 'active' : charge.status]
  );
  return { status: active ? 'active' : charge.status };
}

// Estimated fee = FEE_RATE * attributed bundle GMV for the given month.
export async function getUsage(shop, range = 'this-month') {
  const { since, until } = resolveRange(range);
  const analytics = await getAnalytics(shop, { since, until });
  const gmv = analytics.bundleRevenue;
  const fee = round2(gmv * FEE_RATE);
  return {
    range,
    bundleGmv: gmv,
    feeRate: FEE_RATE,
    estimatedFee: fee,
    bundleOrders: analytics.bundleOrderCount,
    currency: analytics.recentOrders[0]?.currency || 'EUR',
  };
}

// Last 6 months of fees, computed month-by-month.
export async function getFeeHistory(shop) {
  const history = [];
  const now = new Date();
  for (let i = 0; i < 6; i++) {
    const since = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const until = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    // eslint-disable-next-line no-await-in-loop
    const analytics = await getAnalytics(shop, { since, until });
    history.push({
      month: since.toISOString().slice(0, 7),
      bundleGmv: analytics.bundleRevenue,
      fee: round2(analytics.bundleRevenue * FEE_RATE),
      orders: analytics.bundleOrderCount,
    });
  }
  return history;
}

export async function getBillingStatus(shop) {
  const { rows } = await query('SELECT * FROM billing WHERE shop_domain = $1', [shop]);
  return rows[0] || { shop_domain: shop, status: 'pending' };
}

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
