// Talks to the app backend. Every admin call carries a fresh App Bridge
// session token (id token) in the Authorization header so the server can
// verify the request and resolve the shop.

export const APP_URL = window.location.origin;

const params = new URLSearchParams(window.location.search);
export const SHOP = params.get('shop') || '';
export const HOST = params.get('host') || '';

async function getToken() {
  // App Bridge v4 exposes a global `shopify` with idToken().
  if (window.shopify && typeof window.shopify.idToken === 'function') {
    try {
      return await window.shopify.idToken();
    } catch (e) {
      return null;
    }
  }
  return null;
}

async function request(path, { method = 'GET', body } = {}) {
  const token = await getToken();
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${APP_URL}${path}`, {
    method,
    headers,
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
    const err = new Error(json.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json;
}

export const api = {
  getSettings: () => request(`/api/admin/settings/${SHOP}`),
  saveSettings: (patch) => request(`/api/settings/${SHOP}`, { method: 'POST', body: patch }),
  getAnalytics: (range, from, to) => {
    const q = new URLSearchParams({ range });
    if (from) q.set('from', from);
    if (to) q.set('to', to);
    return request(`/api/analytics/${SHOP}?${q.toString()}`);
  },
  getBilling: (range = 'this-month') => request(`/api/billing/usage/${SHOP}?range=${range}`),
  activateBilling: () => request(`/api/billing/activate`, { method: 'POST', body: { shop: SHOP } }),
  getLeads: () => request(`/api/leads/${SHOP}`),
  getPreviewProducts: () => request(`/api/preview-products/${SHOP}`),
};
