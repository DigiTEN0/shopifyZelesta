// Aggregates bundle performance. Revenue/attribution is sourced from Shopify
// Orders that carry a BUNDLE- discount code; funnel metrics come from our own
// bundle_events table.
import { query } from '../db/pool.js';
import { getClient } from './shopsService.js';

const RANGES = {
  'this-week': () => startOfWeek(),
  'this-month': () => startOfMonth(),
  'last-month': () => startOfMonth(-1),
};

export function resolveRange(range, from, to) {
  const now = new Date();
  if (range === 'custom' && from) {
    return { since: new Date(from), until: to ? new Date(to) : now };
  }
  if (range === 'last-month') {
    return { since: startOfMonth(-1), until: startOfMonth(0) };
  }
  const start = (RANGES[range] || startOfMonth)();
  return { since: start, until: now };
}

/**
 * Pulls orders with BUNDLE- codes from Shopify and aggregates revenue.
 * Falls back gracefully (empty arrays) when the shop has no token yet.
 */
export async function getAnalytics(shop, { since, until }) {
  const client = await getClient(shop);

  const orders = client ? await fetchBundleOrders(client, since, until) : [];

  // ── Revenue + AOV from attributed orders ──────────────────
  let bundleRevenue = 0;
  let bundleOrderCount = 0;
  const productFreq = new Map();
  const revenueByDay = new Map();
  const bundlesByDay = new Map();
  const recent = [];

  for (const order of orders) {
    const codes = bundleCodes(order);
    if (codes.length === 0) continue;
    const total = Number(order.total_price || 0);
    bundleRevenue += total;
    bundleOrderCount += 1;

    const day = order.created_at.slice(0, 10);
    revenueByDay.set(day, (revenueByDay.get(day) || 0) + total);
    bundlesByDay.set(day, (bundlesByDay.get(day) || 0) + 1);

    for (const li of order.line_items || []) {
      const key = li.product_id || li.title;
      const prev = productFreq.get(key) || { title: li.title, productId: li.product_id, count: 0 };
      prev.count += li.quantity || 1;
      productFreq.set(key, prev);
    }

    if (recent.length < 25) {
      recent.push({
        orderNumber: order.name,
        orderId: order.id,
        createdAt: order.created_at,
        total,
        currency: order.currency,
        discountCodes: codes,
        discountTotal: Number(order.total_discounts || 0),
        products: (order.line_items || []).map((li) => li.title),
      });
    }
  }

  // ── Store-wide AOV for the lift comparison ────────────────
  const storeAov = client ? await fetchStoreAov(client, since, until) : 0;
  const bundleAov = bundleOrderCount ? bundleRevenue / bundleOrderCount : 0;
  const aovLift = storeAov > 0 ? ((bundleAov - storeAov) / storeAov) * 100 : 0;

  // ── Funnel from our own events ────────────────────────────
  const funnel = await getFunnel(shop, since, until);

  const topProducts = [...productFreq.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    range: { since, until },
    bundleRevenue: round2(bundleRevenue),
    bundleOrderCount,
    bundleAov: round2(bundleAov),
    storeAov: round2(storeAov),
    aovLift: round2(aovLift),
    revenueOverTime: toSeries(revenueByDay),
    bundlesPerDay: toSeries(bundlesByDay),
    topProducts,
    triggerRate: funnel.triggerRate,
    conversionRate: funnel.conversionRate,
    widgetShown: funnel.widgetShown,
    addToCart: funnel.addToCart,
    recentOrders: recent,
  };
}

async function fetchBundleOrders(client, since, until) {
  // Shopify paginates; pull up to a few pages of recent orders in range.
  const params = new URLSearchParams({
    status: 'any',
    created_at_min: since.toISOString(),
    created_at_max: until.toISOString(),
    limit: '250',
    fields: 'id,name,created_at,total_price,total_discounts,currency,discount_codes,line_items',
  });
  try {
    const res = await client.request('GET', `/orders.json?${params.toString()}`);
    // Keep only orders that actually used a BUNDLE- code.
    return (res.orders || []).filter((o) => bundleCodes(o).length > 0);
  } catch (err) {
    // Token revoked, scope missing, or Shopify hiccup — degrade to empty rather
    // than failing the whole dashboard request.
    console.warn('[analytics] could not fetch bundle orders:', err.message);
    return [];
  }
}

async function fetchStoreAov(client, since, until) {
  const params = new URLSearchParams({
    status: 'any',
    created_at_min: since.toISOString(),
    created_at_max: until.toISOString(),
    limit: '250',
    fields: 'id,total_price',
  });
  try {
    const res = await client.request('GET', `/orders.json?${params.toString()}`);
    const orders = res.orders || [];
    if (orders.length === 0) return 0;
    const sum = orders.reduce((s, o) => s + Number(o.total_price || 0), 0);
    return sum / orders.length;
  } catch (err) {
    console.warn('[analytics] could not fetch store AOV:', err.message);
    return 0;
  }
}

function bundleCodes(order) {
  return (order.discount_codes || [])
    .map((d) => d.code)
    .filter((c) => typeof c === 'string' && c.toUpperCase().startsWith('BUNDLE-'));
}

async function getFunnel(shop, since, until) {
  const { rows } = await query(
    `SELECT event_type, COUNT(*)::int AS n
       FROM bundle_events
      WHERE shop_domain = $1 AND created_at BETWEEN $2 AND $3
      GROUP BY event_type`,
    [shop, since, until]
  );
  const map = Object.fromEntries(rows.map((r) => [r.event_type, r.n]));
  const widgetShown = map.widget_shown || 0;
  const addToCart = map.add_to_cart || 0;

  // Trigger rate needs total sessions; approximate with distinct sessions seen.
  const sessRes = await query(
    `SELECT COUNT(DISTINCT session_id)::int AS sessions
       FROM bundle_events
      WHERE shop_domain = $1 AND created_at BETWEEN $2 AND $3`,
    [shop, since, until]
  );
  const sessions = sessRes.rows[0]?.sessions || 0;

  return {
    widgetShown,
    addToCart,
    triggerRate: sessions ? round2((widgetShown / sessions) * 100) : 0,
    conversionRate: widgetShown ? round2((addToCart / widgetShown) * 100) : 0,
  };
}

export async function recordEvent(shop, { sessionId, eventType, productIds, productCount, bundleValue, discountCode }) {
  await query(
    `INSERT INTO bundle_events
       (shop_domain, session_id, event_type, product_ids, product_count, bundle_value, discount_code)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [
      shop,
      sessionId || null,
      eventType,
      JSON.stringify(productIds || []),
      productCount || null,
      bundleValue || null,
      discountCode || null,
    ]
  );
}

// ── helpers ──────────────────────────────────────────────────
function startOfMonth(offset = 0) {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + offset, 1);
}
function startOfWeek() {
  const d = new Date();
  const day = (d.getDay() + 6) % 7; // Monday = 0
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}
function toSeries(map) {
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, value]) => ({ date, value: round2(value) }));
}
function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
