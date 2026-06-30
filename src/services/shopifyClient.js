// Thin wrapper around the Shopify Admin REST API with the shop's access token.
import fetch from 'node-fetch';
import config from '../config/index.js';

export class ShopifyClient {
  constructor(shop, accessToken) {
    this.shop = shop;
    this.accessToken = accessToken;
    this.base = `https://${shop}/admin/api/${config.shopify.apiVersion}`;
  }

  async request(method, path, body) {
    const url = path.startsWith('http') ? path : `${this.base}${path}`;
    const res = await fetch(url, {
      method,
      headers: {
        'X-Shopify-Access-Token': this.accessToken,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const text = await res.text();
    let json;
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = { raw: text };
    }

    if (!res.ok) {
      const err = new Error(
        `Shopify ${method} ${path} failed: ${res.status} ${JSON.stringify(json.errors || json)}`
      );
      err.status = res.status;
      err.body = json;
      throw err;
    }
    return json;
  }

  get(path) {
    return this.request('GET', path);
  }
  post(path, body) {
    return this.request('POST', path, body);
  }
  put(path, body) {
    return this.request('PUT', path, body);
  }
  delete(path) {
    return this.request('DELETE', path);
  }

  // GraphQL Admin API call. Throws on transport or userErrors-level GraphQL errors.
  async graphql(query, variables) {
    const res = await fetch(`${this.base}/graphql.json`, {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': this.accessToken,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ query, variables }),
    });
    const text = await res.text();
    let json;
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = { raw: text };
    }
    if (!res.ok) {
      const err = new Error(`Shopify GraphQL failed: ${res.status} ${text}`);
      err.status = res.status;
      throw err;
    }
    if (json.errors) {
      throw new Error(`Shopify GraphQL errors: ${JSON.stringify(json.errors)}`);
    }
    return json.data;
  }

  // ── OAuth token exchange (no token needed) ──────────────────
  static async exchangeCodeForToken(shop, code) {
    const res = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        client_id: config.shopify.apiKey,
        client_secret: config.shopify.apiSecret,
        code,
      }),
    });
    if (!res.ok) {
      throw new Error(`Token exchange failed: ${res.status} ${await res.text()}`);
    }
    return res.json(); // { access_token, scope }
  }
}

export default ShopifyClient;
