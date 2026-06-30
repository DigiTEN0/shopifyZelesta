// Mints a unique BUNDLE- discount code on Shopify and records it for attribution.
import { query } from '../db/pool.js';
import { getClient } from './shopsService.js';
import { getSettings, publicSettings } from './settingsService.js';
import { computeBundleDiscount } from './discountLogic.js';
import { randomCode } from '../lib/crypto.js';

/**
 * @param {string} shop
 * @param {object} payload  { items:[{productId,variantId,price,quantity}], sessionId }
 * @returns {Promise<{code, discountType, discountValue, discountAmount, total, subtotal, percentOff}>}
 */
export async function generateBundleDiscount(shop, payload) {
  const items = Array.isArray(payload.items) ? payload.items : [];
  if (items.length < 2) {
    const err = new Error('A bundle needs at least 2 products.');
    err.statusCode = 422;
    throw err;
  }

  const settingsRow = await getSettings(shop);
  const settings = publicSettings(settingsRow);

  if (!settings.enabled) {
    const err = new Error('Widget is disabled for this shop.');
    err.statusCode = 403;
    throw err;
  }

  const calc = computeBundleDiscount(items, settings);
  if (!calc.eligible) {
    const err = new Error(`Bundle not eligible for a discount (${calc.reason}).`);
    err.statusCode = 422;
    err.details = calc;
    throw err;
  }

  const client = await getClient(shop);
  if (!client) {
    const err = new Error('Shop is not installed.');
    err.statusCode = 404;
    throw err;
  }

  const code = `BUNDLE-${randomCode(6)}-${Date.now().toString(36).toUpperCase()}`;

  // Unique product ids in the bundle, used to scope the discount for clean attribution.
  const entitledProductIds = [
    ...new Set(items.map((it) => Number(it.productId)).filter(Boolean)),
  ];

  const isPercent = calc.discountType === 'percentage';
  const value = isPercent ? -Math.abs(calc.percentOff) : -Math.abs(calc.discountAmount);

  const priceRulePayload = {
    price_rule: {
      title: code,
      target_type: 'line_item',
      target_selection: entitledProductIds.length ? 'entitled' : 'all',
      allocation_method: 'across',
      value_type: isPercent ? 'percentage' : 'fixed_amount',
      value: value.toFixed(2),
      customer_selection: 'all',
      once_per_customer: true,
      usage_limit: 1,
      starts_at: new Date().toISOString(),
      ...(entitledProductIds.length
        ? { entitled_product_ids: entitledProductIds }
        : {}),
    },
  };

  const ruleRes = await client.post('/price_rules.json', priceRulePayload);
  const priceRule = ruleRes.price_rule;

  const codeRes = await client.post(`/price_rules/${priceRule.id}/discount_codes.json`, {
    discount_code: { code },
  });
  const discountCode = codeRes.discount_code;

  await query(
    `INSERT INTO discount_codes
       (shop_domain, code, price_rule_id, discount_id, discount_type, discount_value,
        product_ids, bundle_value, session_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      shop,
      code,
      priceRule.id,
      discountCode.id,
      calc.discountType,
      calc.discountValue,
      JSON.stringify(entitledProductIds),
      calc.subtotal,
      payload.sessionId || null,
    ]
  );

  // Record the add-to-cart conversion event.
  await query(
    `INSERT INTO bundle_events
       (shop_domain, session_id, event_type, product_ids, product_count, bundle_value, discount_code)
     VALUES ($1,$2,'add_to_cart',$3,$4,$5,$6)`,
    [
      shop,
      payload.sessionId || null,
      JSON.stringify(entitledProductIds),
      items.length,
      calc.subtotal,
      code,
    ]
  );

  return {
    code,
    discountType: calc.discountType,
    discountValue: calc.discountValue,
    discountAmount: calc.discountAmount,
    percentOff: calc.percentOff,
    subtotal: calc.subtotal,
    total: calc.total,
  };
}
