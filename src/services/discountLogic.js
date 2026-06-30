// Pure bundle-discount calculation. No I/O, fully unit-testable.
// Mirrored in the storefront widget (widget/widget.js) for live display —
// keep the two in sync. This server copy is the source of truth used when
// minting the actual Shopify price rule.

/**
 * @param {Array<{price:number, quantity:number}>} items
 * @param {object} settings  public settings shape (see settingsService.publicSettings)
 * @returns {{
 *   subtotal:number, discountType:'percentage'|'fixed',
 *   discountValue:number, discountAmount:number, total:number,
 *   percentOff:number, eligible:boolean, reason:string|null
 * }}
 */
export function computeBundleDiscount(items, settings) {
  const subtotal = items.reduce((sum, it) => sum + Number(it.price) * (it.quantity || 1), 0);
  const productCount = items.reduce((n, it) => n + (it.quantity || 1), 0);
  const distinctCount = items.length;

  const result = {
    subtotal: round2(subtotal),
    discountType: settings.discountType,
    discountValue: 0,
    discountAmount: 0,
    total: round2(subtotal),
    percentOff: 0,
    eligible: false,
    reason: null,
  };

  // Minimum bundle value gate.
  if (subtotal < Number(settings.minBundleValue || 0)) {
    result.reason = 'below_min_value';
    return result;
  }

  // Resolve the base discount from the per-count tiers.
  // 4+ products use the "4" tier (or the highest tier defined).
  const tierValue = resolveTier(settings.tiers, distinctCount);

  // Bundle-value rules can override/raise the discount when cart exceeds a threshold.
  // Highest matching min_value wins.
  const matchedRule = pickValueRule(settings.valueRules, subtotal);

  let discountType = settings.discountType;
  let value = tierValue;

  if (matchedRule) {
    discountType = matchedRule.type || settings.discountType;
    value = Number(matchedRule.amount);
  }

  if (!value || value <= 0) {
    result.reason = 'no_discount_configured';
    return result;
  }

  // Translate to a concrete money amount, then enforce the cap.
  let discountAmount;
  let percentOff;

  if (discountType === 'percentage') {
    const cappedPct = clamp(value, 0, Number(settings.maxDiscountCap || 100));
    percentOff = cappedPct;
    discountAmount = (subtotal * cappedPct) / 100;
  } else {
    // Fixed amount. Cap is interpreted as a max currency amount when type is fixed.
    const cap = Number(settings.maxDiscountCap);
    const capped = cap > 0 ? Math.min(value, cap) : value;
    discountAmount = Math.min(capped, subtotal); // never exceed the subtotal
    percentOff = subtotal > 0 ? (discountAmount / subtotal) * 100 : 0;
  }

  result.eligible = discountAmount > 0;
  result.discountType = discountType;
  result.discountValue = round2(discountType === 'percentage' ? percentOff : discountAmount);
  result.discountAmount = round2(discountAmount);
  result.percentOff = Math.round(percentOff);
  result.total = round2(Math.max(0, subtotal - discountAmount));
  if (!result.eligible) result.reason = 'no_discount_configured';
  return result;
}

function resolveTier(tiers, count) {
  if (!tiers) return 0;
  const keys = Object.keys(tiers)
    .map(Number)
    .filter((n) => !Number.isNaN(n))
    .sort((a, b) => a - b);
  if (keys.length === 0) return 0;
  // Use the highest tier threshold that is <= count.
  let chosen = 0;
  for (const k of keys) {
    if (count >= k) chosen = Number(tiers[k]);
  }
  // If count is below the smallest configured tier, no discount.
  if (count < keys[0]) return 0;
  return chosen;
}

function pickValueRule(rules, subtotal) {
  if (!Array.isArray(rules) || rules.length === 0) return null;
  const matching = rules
    .filter((r) => subtotal >= Number(r.min_value ?? r.minValue ?? 0))
    .sort((a, b) => Number(b.min_value ?? b.minValue ?? 0) - Number(a.min_value ?? a.minValue ?? 0));
  return matching[0] || null;
}

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}
