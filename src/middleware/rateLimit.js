import rateLimit from 'express-rate-limit';

// Protects the discount-minting endpoint from abuse: a single IP can't spam
// Shopify price-rule creation. Keyed by IP + shop.
export const discountRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20, // 20 codes / IP / shop / minute
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${req.ip}:${req.body?.shop || req.query?.shop || ''}`,
  message: { error: 'Too many bundle requests. Please slow down.' },
});

// Lighter limit for analytics/settings reads from the storefront.
export const publicReadRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
});
