// Lead capture: persist the email + browse intent, and (best-effort) push the
// contact into Shopify Customers so the merchant can run targeted campaigns.
import { query } from '../db/pool.js';
import { getClient } from './shopsService.js';

export async function saveLead(shop, { email, name, sessionId, productIds, productTitles, productDetails, code, mode }) {
  const { rows } = await query(
    `INSERT INTO leads (shop_domain, email, name, session_id, product_ids, product_titles, product_details, discount_code, mode)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (shop_domain, email) DO UPDATE
       SET name = COALESCE(EXCLUDED.name, leads.name),
           session_id = EXCLUDED.session_id,
           product_ids = EXCLUDED.product_ids,
           product_titles = EXCLUDED.product_titles,
           product_details = EXCLUDED.product_details,
           discount_code = COALESCE(EXCLUDED.discount_code, leads.discount_code),
           mode = EXCLUDED.mode,
           updated_at = now()
     RETURNING *`,
    [
      shop,
      String(email).toLowerCase().trim(),
      name || null,
      sessionId || null,
      JSON.stringify(productIds || []),
      JSON.stringify(productTitles || []),
      JSON.stringify(productDetails || []),
      code || null,
      mode || null,
    ]
  );
  return rows[0];
}

// Keep an existing lead's browsed products fresh as the shopper keeps browsing
// after the pop-up. Scoped to the original browsing session so a lead can only
// be updated by the visitor who created it. No PII is changed here.
export async function updateLeadProducts(shop, { email, sessionId, productIds, productTitles, productDetails }) {
  if (!email || !sessionId) return 0;
  const { rowCount } = await query(
    `UPDATE leads
        SET product_ids = $4, product_titles = $5, product_details = $6, updated_at = now()
      WHERE shop_domain = $1 AND lower(email) = lower($2) AND session_id = $3`,
    [shop, email, sessionId, JSON.stringify(productIds || []), JSON.stringify(productTitles || []), JSON.stringify(productDetails || [])]
  );
  return rowCount;
}

export async function setCustomerId(shop, email, customerId) {
  await query(
    'UPDATE leads SET shopify_customer_id = $3 WHERE shop_domain = $1 AND email = $2',
    [shop, String(email).toLowerCase().trim(), customerId]
  );
}

// Create the contact in Shopify Customers, opted in for marketing. Requires the
// write_customers scope — degrades gracefully (returns null) if not granted so a
// missing scope never breaks lead capture.
export async function createShopifyCustomer(shop, { email, name, browsedTitles, code }) {
  const client = await getClient(shop);
  if (!client) return null;

  const [firstName, ...rest] = String(name || '').trim().split(' ');
  const note = `BundleBoost lead. Browsed: ${(browsedTitles || []).join(', ') || '—'}. Code: ${code || '—'}`;

  const mutation = `
    mutation leadCustomer($input: CustomerInput!) {
      customerCreate(input: $input) {
        customer { id }
        userErrors { field message }
      }
    }`;
  const variables = {
    input: {
      email: String(email).toLowerCase().trim(),
      firstName: firstName || undefined,
      lastName: rest.join(' ') || undefined,
      note,
      tags: ['bundleboost-lead'],
      emailMarketingConsent: { marketingState: 'SUBSCRIBED', marketingOptInLevel: 'SINGLE_OPT_IN' },
    },
  };

  try {
    const data = await client.graphql(mutation, variables);
    const out = data.customerCreate;
    if (out.userErrors && out.userErrors.length) {
      // Most common: email already a customer. Not fatal.
      console.warn('[leads] customerCreate userErrors:', JSON.stringify(out.userErrors));
      return null;
    }
    const gid = out.customer && out.customer.id;
    return gid ? Number((gid.match(/(\d+)\s*$/) || [])[1]) || null : null;
  } catch (err) {
    // 403 => write_customers scope not granted yet. Lead is still saved locally.
    console.warn('[leads] could not create Shopify customer:', err.message);
    return null;
  }
}

export async function getLeads(shop, limit = 200) {
  const { rows } = await query(
    `SELECT email, name, product_ids, product_titles, product_details, discount_code, mode, shopify_customer_id,
            created_at, COALESCE(updated_at, created_at) AS updated_at
       FROM leads WHERE shop_domain = $1 ORDER BY COALESCE(updated_at, created_at) DESC LIMIT $2`,
    [shop, limit]
  );
  return rows;
}

export async function getLeadStats(shop) {
  const { rows } = await query(
    `SELECT COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE created_at >= date_trunc('month', now()))::int AS this_month
       FROM leads WHERE shop_domain = $1`,
    [shop]
  );
  return rows[0] || { total: 0, this_month: 0 };
}
