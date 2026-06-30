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

  // Discount value + the items it applies to. Scoping to the bundle's products
  // keeps attribution clean (the unique code only ever discounts these items).
  const value = isPercent
    ? { percentage: Math.min(Math.abs(calc.percentOff), 100) / 100 }
    : { discountAmount: { amount: Math.abs(calc.discountAmount).toFixed(2), appliesOnEachItem: false } };

  const itemsInput = entitledProductIds.length
    ? { products: { productsToAdd: entitledProductIds.map((id) => `gid://shopify/Product/${id}`) } }
    : { all: true };

  // Modern GraphQL discount API. Uses the write_discounts scope (REST price_rules
  // needs a separate write_price_rules scope that requires extra approval).
  const mutation = `
    mutation bundleDiscount($input: DiscountCodeBasicInput!) {
      discountCodeBasicCreate(basicCodeDiscount: $input) {
        codeDiscountNode { id }
        userErrors { field message }
      }
    }`;

  const variables = {
    input: {
      title: code,
      code,
      startsAt: new Date().toISOString(),
      customerSelection: { all: true },
      customerGets: { value, items: itemsInput },
      appliesOncePerCustomer: true,
      usageLimit: 1,
    },
  };

  const data = await client.graphql(mutation, variables);
  const out = data.discountCodeBasicCreate;
  if (out.userErrors && out.userErrors.length) {
    const err = new Error(
      `Discount creation failed: ${out.userErrors.map((e) => e.message).join('; ')}`
    );
    err.statusCode = 422;
    throw err;
  }
  const gid = (out.codeDiscountNode && out.codeDiscountNode.id) || '';
  const discountId = Number((gid.match(/(\d+)\s*$/) || [])[1]) || null;

  await query(
    `INSERT INTO discount_codes
       (shop_domain, code, price_rule_id, discount_id, discount_type, discount_value,
        product_ids, bundle_value, session_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      shop,
      code,
      null,
      discountId,
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
