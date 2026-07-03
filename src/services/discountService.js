// Mints a unique BUNDLE- discount code on Shopify and records it for attribution.
import { query } from '../db/pool.js';
import { getClient } from './shopsService.js';
import { getSettings, publicSettings } from './settingsService.js';
import { computeBundleDiscount } from './discountLogic.js';
import { randomCode } from '../lib/crypto.js';

// Server-side truth for the money path: look up every claimed variant on
// Shopify and rebuild the items with the REAL price and product id. A shopper
// can freely choose variants and quantities, but can't inflate prices, invent
// products, or fake item counts to unlock a bigger discount tier.
async function verifyItemsWithShopify(client, rawItems) {
  const claimed = (Array.isArray(rawItems) ? rawItems : [])
    .filter((it) => it && /^\d+$/.test(String(it.variantId)))
    .slice(0, 20);
  if (!claimed.length) return [];

  const ids = [...new Set(claimed.map((it) => String(it.variantId)))]
    .map((id) => `gid://shopify/ProductVariant/${id}`);
  const data = await client.graphql(
    `query bwVerifyItems($ids: [ID!]!) {
       nodes(ids: $ids) { ... on ProductVariant { id price product { id } } }
     }`,
    { ids }
  );

  const real = new Map();
  for (const n of data.nodes || []) {
    if (!n || !n.id) continue;
    const vid = n.id.split('/').pop();
    const pid = n.product && n.product.id ? Number(n.product.id.split('/').pop()) : null;
    real.set(vid, { price: Number(n.price), productId: pid });
  }

  const seen = new Set();
  const out = [];
  for (const it of claimed) {
    const vid = String(it.variantId);
    if (seen.has(vid)) continue;
    seen.add(vid);
    const v = real.get(vid);
    if (!v || !Number.isFinite(v.price)) continue; // unknown/fake variant — dropped
    out.push({ productId: v.productId, variantId: vid, price: v.price, quantity: clampQty(it.quantity) });
  }
  return out;
}

function clampQty(q) {
  const n = parseInt(q, 10);
  return Math.max(1, Math.min(50, Number.isFinite(n) ? n : 1));
}

// Shared: create a one-time code-based discount via the GraphQL discounts API.
async function createCodeDiscount(client, { code, isPercent, value, entitledProductIds }) {
  const discountValue = isPercent
    ? { percentage: Math.min(Math.abs(value), 100) / 100 }
    : { discountAmount: { amount: Math.abs(value).toFixed(2), appliesOnEachItem: false } };
  const itemsInput = entitledProductIds && entitledProductIds.length
    ? { products: { productsToAdd: entitledProductIds.map((id) => `gid://shopify/Product/${id}`) } }
    : { all: true };

  const mutation = `
    mutation d($input: DiscountCodeBasicInput!) {
      discountCodeBasicCreate(basicCodeDiscount: $input) {
        codeDiscountNode { id }
        userErrors { field message }
      }
    }`;
  const data = await client.graphql(mutation, {
    input: {
      title: code,
      code,
      startsAt: new Date().toISOString(),
      customerSelection: { all: true },
      customerGets: { value: discountValue, items: itemsInput },
      appliesOncePerCustomer: true,
      usageLimit: 1,
    },
  });
  const out = data.discountCodeBasicCreate;
  if (out.userErrors && out.userErrors.length) {
    const err = new Error(`Discount creation failed: ${out.userErrors.map((e) => e.message).join('; ')}`);
    err.statusCode = 422;
    throw err;
  }
  const gid = (out.codeDiscountNode && out.codeDiscountNode.id) || '';
  return Number((gid.match(/(\d+)\s*$/) || [])[1]) || null;
}

/**
 * Welcome / single-product discount used by the lead-capture pop-up when the
 * visitor hasn't browsed a full bundle. Uses the merchant's pop-up discount.
 * @param {string} shop
 * @param {{items?:Array, sessionId?:string}} payload
 */
export async function generateWelcomeDiscount(shop, payload = {}) {
  const settingsRow = await getSettings(shop);
  const settings = publicSettings(settingsRow);
  const client = await getClient(shop);
  if (!client) {
    const err = new Error('Shop is not installed.');
    err.statusCode = 404;
    throw err;
  }

  // Mirror the widget: the single-product/welcome discount equals the LOWEST
  // bundle tier (what the icon and pop-up promised). Pop-up value is only a
  // fallback for shops without tiers.
  const tiers = settings.tiers || {};
  const tierKeys = Object.keys(tiers).map(Number).filter((n) => !Number.isNaN(n)).sort((a, b) => a - b);
  let isPercent = (settings.discountType || 'percentage') === 'percentage';
  let value = tierKeys.length ? Number(tiers[tierKeys[0]]) || 0 : 0;
  if (!value) {
    isPercent = (settings.popup.discountType || 'percentage') === 'percentage';
    value = Number(settings.popup.discount) || 0;
  }
  // Only scope the code to products that actually exist on this store.
  const items = await verifyItemsWithShopify(client, payload.items);
  const entitledProductIds = [...new Set(items.map((it) => Number(it.productId)).filter(Boolean))];

  const code = `BUNDLE-${randomCode(6)}-${Date.now().toString(36).toUpperCase()}`;
  const discountId = await createCodeDiscount(client, { code, isPercent, value, entitledProductIds });

  await query(
    `INSERT INTO discount_codes
       (shop_domain, code, price_rule_id, discount_id, discount_type, discount_value, product_ids, session_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [shop, code, null, discountId, isPercent ? 'percentage' : 'fixed', value,
     JSON.stringify(entitledProductIds), payload.sessionId || null]
  );

  return {
    code,
    discountType: isPercent ? 'percentage' : 'fixed',
    discountValue: value,
    label: isPercent ? `${value}%` : value,
  };
}

/**
 * @param {string} shop
 * @param {object} payload  { items:[{productId,variantId,price,quantity}], sessionId }
 * @returns {Promise<{code, discountType, discountValue, discountAmount, total, subtotal, percentOff}>}
 */
export async function generateBundleDiscount(shop, payload) {
  const settingsRow = await getSettings(shop);
  const settings = publicSettings(settingsRow);

  if (!settings.enabled) {
    const err = new Error('Widget is disabled for this shop.');
    err.statusCode = 403;
    throw err;
  }

  const client = await getClient(shop);
  if (!client) {
    const err = new Error('Shop is not installed.');
    err.statusCode = 404;
    throw err;
  }

  // Rebuild the items from Shopify's own data — never trust client prices.
  const items = await verifyItemsWithShopify(client, payload.items);
  if (items.length < 2) {
    const err = new Error('A bundle needs at least 2 products.');
    err.statusCode = 422;
    throw err;
  }

  const calc = computeBundleDiscount(items, settings);
  if (!calc.eligible) {
    const err = new Error(`Bundle not eligible for a discount (${calc.reason}).`);
    err.statusCode = 422;
    err.details = calc;
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
