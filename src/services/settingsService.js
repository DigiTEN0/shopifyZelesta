// Data access + defaults for the `settings` table.
import { query } from '../db/pool.js';

export const DEFAULT_SETTINGS = {
  trigger_threshold: 2,
  discount_type: 'percentage',
  tiers: { 2: 10, 3: 15, 4: 20 },
  value_rules: [],
  max_discount_cap: 40,
  disable_when_sale: false,
  min_bundle_value: 0,
  excluded: { products: [], collections: [] },
  primary_color: '#111827',
  secondary_color: '#6366F1',
  position: 'bottom-right',
  header_text: 'Your Bundle',
  cta_text: 'Add All to Cart & Save',
  badge_text: 'Save {amount}',
  font_family: 'inherit',
  locale: 'en',
  show_prices: true,
  show_compare_at: true,
  savings_as: 'currency',
  redirect_to_cart: false,
  currency: 'EUR',
  enabled: true,
};

// Whitelist of writable columns -> guards against arbitrary key injection.
const WRITABLE = Object.keys(DEFAULT_SETTINGS);

export async function ensureSettings(shop) {
  await query(
    `INSERT INTO settings (shop_domain) VALUES ($1)
     ON CONFLICT (shop_domain) DO NOTHING`,
    [shop]
  );
}

export async function getSettings(shop) {
  const { rows } = await query('SELECT * FROM settings WHERE shop_domain = $1', [shop]);
  if (!rows[0]) {
    await ensureSettings(shop);
    return { shop_domain: shop, ...DEFAULT_SETTINGS };
  }
  return rows[0];
}

export async function saveSettings(shop, patch) {
  await ensureSettings(shop);

  const sets = [];
  const values = [shop];
  let i = 2;

  for (const key of WRITABLE) {
    if (!(key in patch)) continue;
    let value = patch[key];
    // JSONB columns must be serialised.
    if (['tiers', 'value_rules', 'excluded'].includes(key)) {
      value = JSON.stringify(value);
    }
    sets.push(`${key} = $${i}`);
    values.push(value);
    i++;
  }

  if (sets.length === 0) return getSettings(shop);

  sets.push('updated_at = now()');
  const { rows } = await query(
    `UPDATE settings SET ${sets.join(', ')} WHERE shop_domain = $1 RETURNING *`,
    values
  );
  return rows[0];
}

// Settings the storefront widget is allowed to see (no internal columns).
export function publicSettings(s) {
  return {
    triggerThreshold: s.trigger_threshold,
    discountType: s.discount_type,
    tiers: s.tiers,
    valueRules: s.value_rules,
    maxDiscountCap: Number(s.max_discount_cap),
    disableWhenSale: s.disable_when_sale,
    minBundleValue: Number(s.min_bundle_value),
    excluded: s.excluded,
    primaryColor: s.primary_color,
    secondaryColor: s.secondary_color,
    position: s.position,
    headerText: s.header_text,
    ctaText: s.cta_text,
    badgeText: s.badge_text,
    fontFamily: s.font_family,
    locale: s.locale,
    showPrices: s.show_prices,
    showCompareAt: s.show_compare_at,
    savingsAs: s.savings_as,
    redirectToCart: s.redirect_to_cart,
    currency: s.currency,
    enabled: s.enabled,
  };
}
