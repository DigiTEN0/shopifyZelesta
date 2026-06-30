// Shopify webhook receiver. Verifies HMAC against the RAW body (mounted with
// express.raw in server.js) before trusting any payload.
import express from 'express';
import { verifyWebhookHmac } from '../lib/crypto.js';
import { normalizeShop } from '../lib/shopDomain.js';
import { handleAppUninstalled, handleOrderCreate } from '../services/webhookService.js';

const router = express.Router();

function verify(req, res, next) {
  const hmac = req.get('X-Shopify-Hmac-Sha256');
  const raw = req.body; // Buffer, thanks to express.raw
  if (!Buffer.isBuffer(raw) || !verifyWebhookHmac(raw, hmac)) {
    return res.status(401).send('HMAC validation failed.');
  }
  req.shop = normalizeShop(req.get('X-Shopify-Shop-Domain'));
  try {
    req.payload = JSON.parse(raw.toString('utf8'));
  } catch {
    req.payload = {};
  }
  next();
}

router.post('/app/uninstalled', verify, async (req, res) => {
  res.sendStatus(200); // ack fast
  try {
    if (req.shop) await handleAppUninstalled(req.shop);
  } catch (err) {
    console.error('[webhooks] uninstall handler error:', err.message);
  }
});

router.post('/orders/create', verify, async (req, res) => {
  res.sendStatus(200);
  try {
    if (req.shop) await handleOrderCreate(req.shop, req.payload);
  } catch (err) {
    console.error('[webhooks] order handler error:', err.message);
  }
});

export default router;
