// Registers the webhooks we rely on and handles their payloads.
import config from '../config/index.js';
import { getClient, markUninstalled } from './shopsService.js';
import { query } from '../db/pool.js';

const TOPICS = [
  { topic: 'app/uninstalled', address: '/webhooks/app/uninstalled' },
  { topic: 'orders/create', address: '/webhooks/orders/create' },
];

export async function registerWebhooks(shop) {
  const client = await getClient(shop);
  if (!client) return;

  const existing = await client.get('/webhooks.json');
  const have = new Set((existing.webhooks || []).map((w) => `${w.topic}|${w.address}`));

  for (const { topic, address } of TOPICS) {
    const url = `${config.appUrl}${address}`;
    if (have.has(`${topic}|${url}`)) continue;
    try {
      // eslint-disable-next-line no-await-in-loop
      await client.post('/webhooks.json', {
        webhook: { topic, address: url, format: 'json' },
      });
    } catch (err) {
      console.warn(`[webhooks] could not register ${topic}:`, err.message);
    }
  }
}

export async function handleAppUninstalled(shop) {
  await markUninstalled(shop);
  console.log(`[webhooks] ${shop} uninstalled the app.`);
}

// ── GDPR / mandatory compliance webhooks ──────────────────────
// Configure these three endpoint URLs in the Partner Dashboard (app setup →
// compliance webhooks). They must verify HMAC (they do, via the router) and
// return 200. Stealth Mode stores no customer identity, so the only PII we hold
// is lead-capture emails.

// "What data do you have on this customer?" — surface any captured leads.
export async function handleCustomerDataRequest(shop, payload) {
  const email = payload?.customer?.email;
  if (!email) return;
  const { rows } = await query(
    'SELECT id, email, name, created_at FROM leads WHERE shop_domain = $1 AND lower(email) = lower($2)',
    [shop, email]
  );
  // The merchant is the data controller and fulfils the request to the shopper;
  // we log what we hold so it can be handed over. No anonymous browsing data is
  // linked to a customer identity, so there is nothing else to disclose.
  console.log(`[gdpr] data_request ${shop} ${email}: ${rows.length} lead(s) on file`);
}

// "Erase this customer." — delete their captured leads (and any future
// email-linked visitor rows).
export async function handleCustomerRedact(shop, payload) {
  const email = payload?.customer?.email;
  if (!email) return;
  const del = await query('DELETE FROM leads WHERE shop_domain = $1 AND lower(email) = lower($2)', [shop, email]);
  // Visitor rows are anonymous today, but drop any that were later linked to
  // this email so redaction stays complete if that linking is ever enabled.
  await query('DELETE FROM visitors WHERE shop_domain = $1 AND lower(email) = lower($2)', [shop, email]);
  console.log(`[gdpr] customers/redact ${shop} ${email}: removed ${del.rowCount} lead(s)`);
}

// "Erase the whole shop." — sent ~48h after uninstall. Remove everything,
// including the anonymous visitor tables (which are not FK-linked to shops).
export async function handleShopRedact(shop) {
  await query('DELETE FROM visitor_events   WHERE shop_domain = $1', [shop]);
  await query('DELETE FROM visitor_sessions WHERE shop_domain = $1', [shop]);
  await query('DELETE FROM visitors         WHERE shop_domain = $1', [shop]);
  // Deleting the shop row cascades to settings, leads and discount_codes.
  await query('DELETE FROM shops WHERE shop_domain = $1', [shop]);
  console.log(`[gdpr] shop/redact ${shop}: all data erased`);
}

// When an order is created, mark any BUNDLE- discount codes as redeemed and
// attach the order total — gives us instant attribution without polling.
export async function handleOrderCreate(shop, order) {
  const codes = (order.discount_codes || [])
    .map((d) => d.code)
    .filter((c) => typeof c === 'string' && c.toUpperCase().startsWith('BUNDLE-'));

  if (codes.length === 0) return;

  for (const code of codes) {
    // eslint-disable-next-line no-await-in-loop
    await query(
      `UPDATE discount_codes
          SET redeemed = true, order_id = $2, order_total = $3
        WHERE shop_domain = $1 AND code = $4`,
      [shop, order.id, Number(order.total_price || 0), code]
    );
  }
  console.log(`[webhooks] ${shop} order ${order.name} attributed to ${codes.join(', ')}`);
}
