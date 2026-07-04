// Stealth Mode analytics — anonymous 3-layer model (Visitor → Session → Event).
// Everything here is best-effort and defensive: tracking must never throw into
// a shopper's page, and the numbers shown to merchants stay deliberately
// conservative.
import pool, { query } from '../db/pool.js';

const ID_RE = /^(visitor|session)_[a-f0-9]{8,64}$/i;
const EVENT_TYPES = new Set(['product_view', 'add_to_cart', 'purchase']);

// A single visitor who viewed ≥ 2 distinct products in a session is a "bundle
// opportunity". We assume only a conservative slice of them would actually
// complete a bundle — never inflate.
const CAPTURE_RATE = 0.10;
const MAX_BUNDLE_PRODUCTS = 3; // a realistic bundle size for value estimates

function validId(id) {
  return typeof id === 'string' && ID_RE.test(id);
}
function clampStr(v, n) {
  return v == null ? null : String(v).slice(0, n);
}
function clampInt(v, lo, hi) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : null;
}
// Prices arrive from Shopify's product.js in CENTS (e.g. 4299 = €42.99). We keep
// cents in the DB for precision and only convert to a decimal currency amount
// when handing values to the dashboard, which formats them as money.
function toEuros(cents) {
  return Math.round(Number(cents) || 0) / 100;
}

/**
 * Records a batch of events for one visitor+session. Upserts the visitor and
 * session (keeping counts), then inserts the events in a single statement.
 */
export async function recordBatch(shop, { visitorId, sessionId, events }) {
  if (!validId(visitorId) || !validId(sessionId)) return { ok: false };
  const clean = (Array.isArray(events) ? events : [])
    .filter((e) => e && EVENT_TYPES.has(e.type))
    .slice(0, 25)
    .map((e) => ({
      type: e.type,
      productId: clampStr(e.productId, 40),
      title: clampStr(e.title, 200),
      handle: clampStr(e.handle, 200),
      price: clampInt(e.price, 0, 100000000),
    }));
  if (!clean.length) return { ok: false };

  const views = clean.filter((e) => e.type === 'product_view').length;
  const purchased = clean.some((e) => e.type === 'purchase');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `INSERT INTO visitors (id, shop_domain, view_count, purchased)
         VALUES ($1,$2,$3,$4)
       ON CONFLICT (id) DO UPDATE
         SET last_seen = now(),
             view_count = visitors.view_count + $3,
             purchased = visitors.purchased OR $4`,
      [visitorId, shop, views, purchased]
    );

    // Is this a brand-new session? xmax = 0 on the returned row means "inserted".
    const sess = await client.query(
      `INSERT INTO visitor_sessions (id, visitor_id, shop_domain, view_count)
         VALUES ($1,$2,$3,$4)
       ON CONFLICT (id) DO UPDATE
         SET last_event_at = now(),
             view_count = visitor_sessions.view_count + $4
       RETURNING (xmax = 0) AS inserted`,
      [sessionId, visitorId, shop, views]
    );
    if (sess.rows[0]?.inserted) {
      await client.query('UPDATE visitors SET session_count = session_count + 1 WHERE id = $1', [visitorId]);
    }

    // Multi-row insert of the events.
    const cols = [];
    const vals = [];
    let i = 1;
    for (const e of clean) {
      cols.push(`($${i},$${i + 1},$${i + 2},$${i + 3},$${i + 4},$${i + 5},$${i + 6},$${i + 7})`);
      vals.push(shop, visitorId, sessionId, e.type, e.productId, e.title, e.handle, e.price);
      i += 8;
    }
    await client.query(
      `INSERT INTO visitor_events
         (shop_domain, visitor_id, session_id, event_type, product_id, product_title, product_handle, price)
       VALUES ${cols.join(',')}`,
      vals
    );

    await client.query('COMMIT');
    return { ok: true };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.warn('[visitor] recordBatch failed:', err.message);
    return { ok: false };
  } finally {
    client.release();
  }
}

// Paginated visitor list for the Explorer table.
export async function listVisitors(shop, { limit = 50, offset = 0 } = {}) {
  const lim = Math.max(1, Math.min(200, limit));
  const off = Math.max(0, offset);
  const { rows } = await query(
    `SELECT v.id, v.first_seen, v.last_seen, v.session_count, v.purchased, v.email, v.customer_id,
            agg.distinct_products, agg.potential_value
       FROM visitors v
       LEFT JOIN LATERAL (
         WITH d AS (
           SELECT DISTINCT product_id, price FROM visitor_events
            WHERE visitor_id = v.id AND event_type = 'product_view' AND product_id IS NOT NULL
         ),
         ranked AS (SELECT price, ROW_NUMBER() OVER (ORDER BY price DESC) AS rn FROM d)
         SELECT (SELECT COUNT(*) FROM d) AS distinct_products,
                COALESCE((SELECT SUM(price) FROM ranked WHERE rn <= $4), 0) AS potential_value
       ) agg ON true
      WHERE v.shop_domain = $1
      ORDER BY v.last_seen DESC
      LIMIT $2 OFFSET $3`,
    [shop, lim, off, MAX_BUNDLE_PRODUCTS]
  );
  const { rows: totalRows } = await query('SELECT COUNT(*)::int AS n FROM visitors WHERE shop_domain = $1', [shop]);
  return {
    total: totalRows[0]?.n || 0,
    visitors: rows.map((r) => ({
      id: r.id,
      firstSeen: r.first_seen,
      lastSeen: r.last_seen,
      sessions: Number(r.session_count) || 0,
      viewedProducts: Number(r.distinct_products) || 0,
      potentialValue: toEuros(r.potential_value),
      purchased: r.purchased,
      email: r.email || null,
      customerId: r.customer_id || null,
    })),
  };
}

// One visitor + full session history.
export async function getVisitor(shop, visitorId) {
  if (!validId(visitorId)) return null;
  const { rows: vs } = await query(
    `SELECT id, first_seen, last_seen, session_count, view_count, purchased, email, customer_id
       FROM visitors WHERE shop_domain = $1 AND id = $2`,
    [shop, visitorId]
  );
  if (!vs[0]) return null;
  const v = vs[0];

  const { rows: events } = await query(
    `SELECT session_id, event_type, product_id, product_title, price, created_at
       FROM visitor_events
      WHERE shop_domain = $1 AND visitor_id = $2
      ORDER BY created_at ASC
      LIMIT 2000`,
    [shop, visitorId]
  );

  // Group events into sessions, preserving browse order.
  const bySession = new Map();
  for (const e of events) {
    if (!bySession.has(e.session_id)) bySession.set(e.session_id, []);
    bySession.get(e.session_id).push({
      type: e.event_type,
      productId: e.product_id,
      title: e.product_title,
      price: e.price ? toEuros(e.price) : null,
      at: e.created_at,
    });
  }
  const sessions = [...bySession.entries()].map(([id, evs]) => ({
    id,
    startedAt: evs[0]?.at,
    events: evs,
  })).sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));

  // Distinct viewed products across all sessions, for the value estimate.
  const distinct = new Map();
  for (const e of events) {
    if (e.event_type === 'product_view' && e.product_id) distinct.set(e.product_id, Math.round(Number(e.price) || 0));
  }
  const potentialValueCents = [...distinct.values()].sort((a, b) => b - a).slice(0, MAX_BUNDLE_PRODUCTS)
    .reduce((s, p) => s + p, 0);

  return {
    id: v.id,
    firstSeen: v.first_seen,
    lastSeen: v.last_seen,
    totalSessions: Number(v.session_count) || sessions.length,
    totalProductsViewed: Number(v.view_count) || 0,
    distinctProducts: distinct.size,
    potentialValue: toEuros(potentialValueCents),
    purchased: v.purchased,
    email: v.email || null,
    customerId: v.customer_id || null,
    sessions,
  };
}

// Conservative potential-revenue estimate for a date range.
export async function getPotential(shop, { since, until }, settings = {}) {
  // Distinct (session, product, price) so repeat views don't double-count.
  const { rows } = await query(
    `WITH per AS (
       SELECT DISTINCT session_id, product_id, price
         FROM visitor_events
        WHERE shop_domain = $1 AND event_type = 'product_view'
          AND product_id IS NOT NULL AND created_at BETWEEN $2 AND $3
     ),
     capped AS (
       SELECT session_id, product_id, price,
              ROW_NUMBER() OVER (PARTITION BY session_id ORDER BY price DESC) AS rn
         FROM per
     ),
     sess AS (
       SELECT session_id,
              COUNT(*) AS products,
              SUM(price) FILTER (WHERE rn <= $4) AS bundle_value
         FROM capped GROUP BY session_id
     )
     SELECT
       COUNT(*)::int AS total_sessions,
       COUNT(*) FILTER (WHERE products >= 2)::int AS bundle_intent_sessions,
       COALESCE(AVG(bundle_value) FILTER (WHERE products >= 2), 0) AS avg_bundle_value
       FROM sess`,
    [shop, since, until, MAX_BUNDLE_PRODUCTS]
  );
  const r = rows[0] || {};
  const totalSessions = Number(r.total_sessions) || 0;
  const intent = Number(r.bundle_intent_sessions) || 0;
  const avgBundleValue = Math.round(Number(r.avg_bundle_value) || 0);

  // Revenue is computed from the fractional expectation so it doesn't collapse
  // to 0 at low traffic (rounding orders first would hide real potential).
  const expectedOrders = intent * CAPTURE_RATE;
  const potentialOrders = Math.round(expectedOrders);
  const potentialRevenue = Math.round(expectedOrders * avgBundleValue);

  // AOV uplift baseline: the average price of a single product. A bundle order
  // (avg bundle value) vs a normal single-item order is the AOV increase.
  const { rows: baseRows } = await query(
    `SELECT COALESCE(AVG(price), 0) AS avg_single
       FROM (
         SELECT DISTINCT session_id, product_id, price
           FROM visitor_events
          WHERE shop_domain = $1 AND event_type = 'product_view'
            AND product_id IS NOT NULL AND price > 0
            AND created_at BETWEEN $2 AND $3
       ) d`,
    [shop, since, until]
  );
  const avgSingleValue = Math.round(Number(baseRows[0]?.avg_single) || 0); // cents
  const aovIncrease = avgSingleValue > 0
    ? Math.round(((avgBundleValue - avgSingleValue) / avgSingleValue) * 1000) / 10
    : 0;
  const bundleIntentRate = totalSessions > 0 ? Math.round((intent / totalSessions) * 1000) / 10 : 0;

  return {
    captureRate: CAPTURE_RATE,
    totalSessions,
    bundleIntentSessions: intent,
    bundleIntentRate,           // % of sessions that browsed ≥ 2 products
    potentialBundleOrders: potentialOrders,
    potentialBundleRevenue: toEuros(potentialRevenue),
    averageBundleValue: toEuros(avgBundleValue),
    potentialAovIncrease: Math.max(0, aovIncrease),
  };
}

// Product intelligence: top viewed + most co-viewed pairs.
export async function getIntelligence(shop, { since, until }) {
  const [top, pairs] = await Promise.all([
    query(
      `SELECT product_id, MAX(product_title) AS title, COUNT(*)::int AS views,
              COUNT(DISTINCT session_id)::int AS sessions
         FROM visitor_events
        WHERE shop_domain = $1 AND event_type = 'product_view' AND product_id IS NOT NULL
          AND created_at BETWEEN $2 AND $3
        GROUP BY product_id
        ORDER BY views DESC
        LIMIT 10`,
      [shop, since, until]
    ),
    query(
      `WITH per AS (
         SELECT DISTINCT session_id, product_id, product_title
           FROM visitor_events
          WHERE shop_domain = $1 AND event_type = 'product_view' AND product_id IS NOT NULL
            AND created_at BETWEEN $2 AND $3
       )
       SELECT a.product_title AS a_title, b.product_title AS b_title, COUNT(*)::int AS together
         FROM per a
         JOIN per b ON a.session_id = b.session_id AND a.product_id < b.product_id
        GROUP BY a.product_title, b.product_title
        ORDER BY together DESC
        LIMIT 10`,
      [shop, since, until]
    ),
  ]);
  return {
    topProducts: top.rows.map((r) => ({ productId: r.product_id, title: r.title, views: r.views, sessions: r.sessions })),
    coViewed: pairs.rows.map((r) => ({ a: r.a_title, b: r.b_title, together: r.together })),
  };
}
