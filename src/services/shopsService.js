// Data access for the `shops` table. Owns token encrypt/decrypt.
import { query } from '../db/pool.js';
import { encrypt, decrypt } from '../lib/crypto.js';
import ShopifyClient from './shopifyClient.js';

export async function upsertShop({ shop, accessToken, scope }) {
  const enc = encrypt(accessToken);
  const { rows } = await query(
    `INSERT INTO shops (shop_domain, access_token_enc, scope, uninstalled_at, updated_at)
     VALUES ($1, $2, $3, NULL, now())
     ON CONFLICT (shop_domain)
     DO UPDATE SET access_token_enc = EXCLUDED.access_token_enc,
                   scope = EXCLUDED.scope,
                   uninstalled_at = NULL,
                   updated_at = now()
     RETURNING *`,
    [shop, enc, scope]
  );
  return rows[0];
}

export async function getShop(shop) {
  const { rows } = await query('SELECT * FROM shops WHERE shop_domain = $1', [shop]);
  return rows[0] || null;
}

export async function getAccessToken(shop) {
  const row = await getShop(shop);
  if (!row || !row.access_token_enc) return null;
  return decrypt(row.access_token_enc);
}

// Returns a ready-to-use authenticated client, or null if the shop isn't installed.
export async function getClient(shop) {
  const token = await getAccessToken(shop);
  if (!token) return null;
  return new ShopifyClient(shop, token);
}

export async function setScriptTagId(shop, scriptTagId) {
  await query(
    'UPDATE shops SET script_tag_id = $2, updated_at = now() WHERE shop_domain = $1',
    [shop, scriptTagId]
  );
}

export async function markUninstalled(shop) {
  await query(
    'UPDATE shops SET uninstalled_at = now(), access_token_enc = NULL, updated_at = now() WHERE shop_domain = $1',
    [shop]
  );
}

export async function isInstalled(shop) {
  const row = await getShop(shop);
  return Boolean(row && row.access_token_enc && !row.uninstalled_at);
}
