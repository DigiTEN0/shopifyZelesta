// Shopify OAuth 2.0 + install flow.
//   GET /install?shop=...      -> redirect merchant into Shopify consent
//   GET /auth/shopify?shop=... -> alias for /install (per spec)
//   GET /auth/callback         -> exchange code, store token, register ScriptTag
import express from 'express';
import config from '../config/index.js';
import { normalizeShop, isValidShop } from '../lib/shopDomain.js';
import { verifyOAuthHmac, randomNonce, safeCompare } from '../lib/crypto.js';
import ShopifyClient from '../services/shopifyClient.js';
import { upsertShop } from '../services/shopsService.js';
import { ensureSettings } from '../services/settingsService.js';
import { ensureScriptTag } from '../services/scriptTagService.js';
import { registerWebhooks } from '../services/webhookService.js';

const router = express.Router();
const STATE_COOKIE = 'bw_oauth_state';

function beginOAuth(req, res) {
  const shop = normalizeShop(req.query.shop);
  if (!shop) {
    return res.status(400).send('Missing or invalid ?shop=your-store.myshopify.com');
  }

  const state = randomNonce();
  res.cookie(STATE_COOKIE, state, {
    httpOnly: true,
    secure: config.env === 'production',
    sameSite: 'lax',
    maxAge: 10 * 60 * 1000,
    signed: true,
  });

  const redirectUri = `${config.appUrl}/auth/callback`;
  const installUrl =
    `https://${shop}/admin/oauth/authorize?` +
    new URLSearchParams({
      client_id: config.shopify.apiKey,
      scope: config.shopify.scopes,
      redirect_uri: redirectUri,
      state,
      'grant_options[]': '',
    }).toString();

  res.redirect(installUrl);
}

router.get('/install', beginOAuth);
router.get('/auth/shopify', beginOAuth);

router.get('/auth/callback', async (req, res) => {
  try {
    const { shop: rawShop, code, state, host } = req.query;
    const shop = normalizeShop(rawShop);

    if (!shop || !isValidShop(shop)) {
      return res.status(400).send('Invalid shop.');
    }
    if (!verifyOAuthHmac(req.query)) {
      return res.status(400).send('HMAC verification failed.');
    }
    const cookieState = req.signedCookies?.[STATE_COOKIE];
    if (!state || !cookieState || !safeCompare(state, cookieState)) {
      return res.status(403).send('Invalid OAuth state.');
    }
    res.clearCookie(STATE_COOKIE);

    // Exchange the authorization code for a permanent access token.
    const tokenRes = await ShopifyClient.exchangeCodeForToken(shop, code);
    await upsertShop({ shop, accessToken: tokenRes.access_token, scope: tokenRes.scope });
    await ensureSettings(shop);

    // Make the widget live + wire up uninstall/order webhooks. Non-fatal on error.
    try {
      await ensureScriptTag(shop);
      await registerWebhooks(shop);
    } catch (err) {
      console.error('[oauth] post-install setup warning:', err.message);
    }

    // Redirect into the embedded admin app.
    const params = new URLSearchParams({ shop });
    if (host) params.set('host', host);
    res.redirect(`/?${params.toString()}`);
  } catch (err) {
    console.error('[oauth] callback error:', err);
    res.status(500).send('OAuth failed. Please try installing again.');
  }
});

export default router;
