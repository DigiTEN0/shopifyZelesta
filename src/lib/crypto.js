// AES-256-GCM encryption for access tokens at rest, and Shopify HMAC helpers.
import crypto from 'crypto';
import config from '../config/index.js';

const ALGO = 'aes-256-gcm';

function getKey() {
  const hex = config.security.tokenEncryptionKey;
  const key = Buffer.from(hex, 'hex');
  if (key.length !== 32) {
    throw new Error(
      'TOKEN_ENCRYPTION_KEY must be 64 hex chars (32 bytes). Generate with: openssl rand -hex 32'
    );
  }
  return key;
}

// Returns "iv:authTag:ciphertext", all hex.
export function encrypt(plaintext) {
  if (plaintext == null) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  const enc = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
}

export function decrypt(payload) {
  if (!payload) return null;
  const [ivHex, tagHex, dataHex] = payload.split(':');
  if (!ivHex || !tagHex || !dataHex) return null;
  const decipher = crypto.createDecipheriv(ALGO, getKey(), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  const dec = Buffer.concat([
    decipher.update(Buffer.from(dataHex, 'hex')),
    decipher.final(),
  ]);
  return dec.toString('utf8');
}

// Timing-safe comparison of two hex/base64 strings of equal length.
export function safeCompare(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

// Verifies the HMAC on an OAuth / redirect query string.
// `query` is the parsed query object; Shopify signs all params except `hmac`/`signature`.
export function verifyOAuthHmac(query) {
  const { hmac, signature, ...rest } = query;
  if (!hmac) return false;
  const message = Object.keys(rest)
    .sort()
    .map((key) => `${key}=${Array.isArray(rest[key]) ? rest[key].join(',') : rest[key]}`)
    .join('&');
  const digest = crypto
    .createHmac('sha256', config.shopify.apiSecret)
    .update(message)
    .digest('hex');
  return safeCompare(digest, hmac);
}

// Verifies the X-Shopify-Hmac-Sha256 header on a webhook (raw body required).
export function verifyWebhookHmac(rawBody, hmacHeader) {
  if (!hmacHeader) return false;
  const digest = crypto
    .createHmac('sha256', config.shopify.apiSecret)
    .update(rawBody, 'utf8')
    .digest('base64');
  return safeCompare(digest, hmacHeader);
}

export function randomCode(length = 6) {
  // Unambiguous alphabet (no 0/O/1/I).
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  const bytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

export function randomNonce() {
  return crypto.randomBytes(16).toString('hex');
}
