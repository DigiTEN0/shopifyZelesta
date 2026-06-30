// Validation + normalisation for myshopify.com shop domains.
const SHOP_REGEX = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i;

export function normalizeShop(input) {
  if (!input || typeof input !== 'string') return null;
  let shop = input.trim().toLowerCase();
  shop = shop.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  // Allow passing just the handle, e.g. "zelesta".
  if (!shop.includes('.') && shop.length > 0) shop = `${shop}.myshopify.com`;
  return isValidShop(shop) ? shop : null;
}

export function isValidShop(shop) {
  return typeof shop === 'string' && SHOP_REGEX.test(shop);
}
