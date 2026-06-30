// Verifies a Shopify App Bridge session token (JWT, HS256 signed with the app
// secret) on admin/dashboard API calls. Extracts the shop from `dest` and
// attaches it as req.shop. This is the proper way to auth embedded-app requests.
import crypto from 'crypto';
import config from '../config/index.js';
import { isInstalled } from '../services/shopsService.js';
import { normalizeShop } from '../lib/shopDomain.js';

function base64urlDecode(str) {
  return Buffer.from(str.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

function verifyJwt(token) {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, sigB64] = parts;

  const expected = crypto
    .createHmac('sha256', config.shopify.apiSecret)
    .update(`${headerB64}.${payloadB64}`)
    .digest();
  const actual = base64urlDecode(sigB64);
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
    return null;
  }

  let payload;
  try {
    payload = JSON.parse(base64urlDecode(payloadB64).toString('utf8'));
  } catch {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && now >= payload.exp) return null;
  if (payload.nbf && now < payload.nbf - 5) return null;
  if (payload.aud && payload.aud !== config.shopify.apiKey) return null;
  return payload;
}

export function requireSessionToken(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'Missing session token.' });
  }

  const payload = verifyJwt(token);
  if (!payload) {
    return res.status(401).json({ error: 'Invalid or expired session token.' });
  }

  // dest looks like "https://shop.myshopify.com"
  const shop = normalizeShop(payload.dest || payload.iss || '');
  if (!shop) {
    return res.status(401).json({ error: 'Token missing shop destination.' });
  }

  // If a :shop param is present it must match the token's shop.
  const paramShop = req.params.shop ? normalizeShop(req.params.shop) : null;
  if (paramShop && paramShop !== shop) {
    return res.status(403).json({ error: 'Shop mismatch.' });
  }

  req.shop = shop;
  req.session = payload;
  next();
}

// Variant that also confirms the shop is actually installed.
export function requireInstalledSession(req, res, next) {
  requireSessionToken(req, res, async () => {
    try {
      if (!(await isInstalled(req.shop))) {
        return res.status(403).json({ error: 'Shop is not installed.' });
      }
      next();
    } catch (err) {
      next(err);
    }
  });
}
