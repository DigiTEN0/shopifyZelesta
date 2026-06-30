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
