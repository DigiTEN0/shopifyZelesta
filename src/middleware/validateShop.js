// For public storefront endpoints: ensure a syntactically valid, installed shop.
import { normalizeShop } from '../lib/shopDomain.js';
import { isInstalled } from '../services/shopsService.js';

export function validateShopParam(req, res, next) {
  const raw = req.params.shop || req.query.shop || req.body?.shop;
  const shop = normalizeShop(raw);
  if (!shop) {
    return res.status(400).json({ error: 'Invalid shop domain.' });
  }
  req.shop = shop;
  next();
}

export function requireInstalledShop(req, res, next) {
  validateShopParam(req, res, async () => {
    try {
      if (!(await isInstalled(req.shop))) {
        return res.status(404).json({ error: 'Shop is not installed.' });
      }
      next();
    } catch (err) {
      next(err);
    }
  });
}
