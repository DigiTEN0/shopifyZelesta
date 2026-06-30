# Bundle Widget — Shopify App

A production-ready Shopify app that tracks what a visitor browses, then surfaces a
beautiful floating **bundle** widget with an automatic discount. One click adds
everything to cart. Every bundle gets a unique `BUNDLE-` discount code, so revenue
attribution is 100% clean.

- **Embedded admin dashboard** — React + Shopify Polaris, lives natively inside Shopify admin.
- **Storefront widget** — vanilla JS, zero dependencies, injected via ScriptTag.
- **Backend** — Node.js + Express + PostgreSQL.
- **Standalone demo** — `/demo`, no Shopify connection needed (for sales & Loom recordings).

> Direct install via URL — no App Store listing required.

---

## Table of contents

1. [Architecture](#architecture)
2. [Project structure](#project-structure)
3. [Quick start (local)](#quick-start-local)
4. [Environment variables](#environment-variables)
5. [Create the Shopify app](#create-the-shopify-app)
6. [Deploy to Railway](#deploy-to-railway)
7. [Install on your own store](#install-on-your-own-store)
8. [Record your Loom with the demo](#record-your-loom-with-the-demo)
9. [How it works](#how-it-works)
10. [API reference](#api-reference)
11. [Security](#security)

---

## Architecture

A **single deployable Node service** serves everything:

```
                    ┌──────────────────────────────────────────────┐
   Shopify Admin ──▶│  Express server (Railway)                    │
   (embedded app)   │   • /                → React/Polaris dashboard │
                    │   • /api/*           → JSON API               │
   Storefront   ───▶│   • /widget/widget.js→ vanilla JS widget      │
   (myshopify)      │   • /auth/*, /install→ OAuth 2.0              │
                    │   • /webhooks/*      → HMAC-verified webhooks  │
   Prospect    ────▶│   • /demo            → standalone showcase     │
                    └───────────────┬──────────────────────────────┘
                                    │
                              PostgreSQL
                 (shops, settings, discount_codes, bundle_events, billing)
```

- The **widget** runs on the merchant's storefront, tracks browsing in
  `localStorage`, and calls the backend to mint a discount code on checkout.
- The **dashboard** authenticates every request with a Shopify **App Bridge session
  token** (JWT) that the backend verifies with the app secret.
- **Attribution** is read straight from Shopify Orders that carry a `BUNDLE-` code.

---

## Project structure

```
.
├── src/                      # Express backend
│   ├── server.js             # app bootstrap, static + SPA serving
│   ├── config/               # env-driven config
│   ├── db/                   # pg pool, schema.sql, migration runner
│   ├── lib/                  # crypto (AES-GCM + HMAC), shop-domain validation
│   ├── middleware/           # session token, shop validation, rate limit, CORS
│   ├── routes/               # auth, api, webhooks
│   └── services/             # shopify client, discount, settings, analytics, billing…
├── widget/
│   └── widget.js             # the storefront widget (vanilla JS, zero deps)
├── demo/
│   ├── index.html            # standalone demo store
│   └── demo.js               # hardcoded products + boots the real widget
├── dashboard/                # React + Polaris embedded admin app (Vite)
│   ├── index.html
│   └── src/
│       ├── App.jsx           # Frame + sidebar nav + routing
│       ├── lib/              # API client (session-token auth), formatters
│       ├── components/       # charts, live WidgetPreview
│       └── pages/            # Dashboard, BundleSettings, WidgetCustomisation, Analytics, Billing
├── package.json
├── railway.json              # Railway build + start config
└── .env.example
```

---

## Quick start (local)

**Prerequisites:** Node 18+, PostgreSQL 14+.

```bash
# 1. Install backend deps (auto-creates .env from .env.example)
npm install

# 2. Create a local database and point DATABASE_URL at it
createdb bundle_widget
# edit .env -> DATABASE_URL=postgres://localhost:5432/bundle_widget

# 3. Generate a token-encryption key and paste it into .env
openssl rand -hex 32     # -> TOKEN_ENCRYPTION_KEY

# 4. Run migrations
npm run db:migrate

# 5. Build the dashboard (needs your Shopify API key for App Bridge)
VITE_SHOPIFY_API_KEY=your_api_key npm run build

# 6. Start
npm start            # http://localhost:3000
```

Open **http://localhost:3000/demo** — the widget works immediately, no Shopify needed.

For dashboard development with hot reload:

```bash
cd dashboard && VITE_SHOPIFY_API_KEY=your_api_key npm run dev   # http://localhost:5173 (proxies /api to :3000)
```

---

## Environment variables

See [`.env.example`](.env.example). The important ones:

| Variable | What it is |
| --- | --- |
| `APP_URL` | Public URL of the deployment (no trailing slash). |
| `SHOPIFY_API_KEY` / `SHOPIFY_API_SECRET` | From your Shopify Partner app. |
| `SHOPIFY_SCOPES` | `read_products,write_discounts,read_orders,write_script_tags,read_script_tags` |
| `DATABASE_URL` | Postgres connection string. |
| `DATABASE_SSL` | `true` on Railway, `false` locally. |
| `TOKEN_ENCRYPTION_KEY` | 64 hex chars. Encrypts access tokens at rest. `openssl rand -hex 32`. |
| `SESSION_SECRET` | Signs the OAuth state cookie. |
| `BILLING_FEE_RATE` | `0.005` = 0.5% of bundle GMV. |
| `BILLING_TEST_MODE` | `true` = no real charges (use while testing). |

> The dashboard needs `VITE_SHOPIFY_API_KEY` **at build time** (Vite inlines it into
> the App Bridge `<meta>` tag). On Railway, set it as a service variable so the build
> picks it up.

---

## Create the Shopify app

1. In the [Shopify Partner dashboard](https://partners.shopify.com), **Apps → Create app → Create app manually**.
2. Copy the **API key** and **API secret key** into your env.
3. Set **App URL**: `https://<your-app>.up.railway.app/`
4. Set **Allowed redirection URL(s)**: `https://<your-app>.up.railway.app/auth/callback`
5. Under **App setup → Embedded app**, make sure *Embed app in Shopify admin* is on.
6. Scopes are requested at install time from `SHOPIFY_SCOPES` — no extra config needed.

---

## Deploy to Railway

1. Push this repo to GitHub and **New Project → Deploy from GitHub** in Railway.
2. Add the **PostgreSQL** plugin — Railway injects `DATABASE_URL` automatically.
3. Add service variables: `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, `APP_URL`
   (your Railway URL), `TOKEN_ENCRYPTION_KEY`, `SESSION_SECRET`, `DATABASE_SSL=true`,
   `VITE_SHOPIFY_API_KEY` (same as the API key), `BILLING_TEST_MODE=true`.
4. `railway.json` already defines the build (`npm install && npm run build`) and
   start (`npm run db:migrate && npm start`) commands.
5. Deploy. Visit `https://<your-app>.up.railway.app/demo` to confirm it's live.

---

## Install on your own store

```
https://<your-app>.up.railway.app/install?shop=zelesta.myshopify.com
```

The flow:

1. OAuth 2.0 consent → token stored (encrypted).
2. ScriptTag auto-registered → **widget live on the storefront**.
3. `app/uninstalled` + `orders/create` webhooks registered (for attribution).
4. Redirect into the embedded dashboard.
5. Setup checklist guides you to your first discount rule.

Widget is live within ~2 minutes.

---

## Record your Loom with the demo

Open **`/demo`** — a stunning sample bedding store with the widget already expanded
showing three products (duvet, pillowcase, fitted sheet). It runs entirely in the
browser with no Shopify connection, so it's perfect for sales demos and Loom
recordings. You can switch variants, change quantities, remove items, and click
**Add All to Cart & Save** to see the success state.

The **Widget Customisation** page in the dashboard has a *Demo mode* button that opens
this in a new tab, plus a live in-page preview that uses the exact same widget code.

---

## How it works

**Bundle discount logic** (configurable in *Bundle Settings*):

- **Size tiers** — 2 / 3 / 4+ products each map to a discount.
- **Bundle-value rules** — "if subtotal ≥ €X, apply Y% / €Y off". Highest matching
  threshold wins and overrides the size tier.
- **Maximum cap** — a hard ceiling the discount can never exceed (margin safety net).
- **Minimum bundle value** — only offer a discount above this subtotal.
- **Exclusions** — blacklist product/collection IDs.
- **Stacking** — optionally disable while a sitewide sale is running.

**Attribution & billing.** Each bundle mints a one-time Shopify price rule + discount
code prefixed `BUNDLE-`. Revenue is read back from Shopify Orders that used those
codes, so the Performance plan fee (0.5% of bundle GMV) is computed from Shopify's own
data — undeniable and clean.

---

## API reference

Public (storefront widget, CORS-enabled, shop-validated, rate-limited):

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/settings/:shop` | Widget config for the storefront. |
| `POST` | `/api/discount/generate` | Mint a unique `BUNDLE-` code (rate-limited). |
| `POST` | `/api/events` | Funnel events (impressions / add-to-cart). |

Admin (embedded dashboard, **App Bridge session-token** protected):

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/admin/settings/:shop` | Full settings + setup meta. |
| `POST` | `/api/settings/:shop` | Save merchant settings. |
| `GET` | `/api/analytics/:shop` | Aggregated bundle analytics. |
| `POST` | `/api/billing/activate` | Start Shopify billing. |
| `GET` | `/api/billing/usage/:shop` | Current fee + 6-month history. |

OAuth & webhooks: `GET /install`, `GET /auth/shopify`, `GET /auth/callback`,
`POST /webhooks/app/uninstalled`, `POST /webhooks/orders/create`.

---

## Security

- Access tokens **encrypted at rest** (AES-256-GCM).
- **OAuth HMAC + state** verified on callback.
- **Webhook HMAC** verified against the raw body.
- Admin API calls require a **verified session-token JWT**; the shop is taken from the
  token, never trusted from the client.
- Discount generation is **rate-limited** per IP + shop.
- Shop domains are validated/normalised on every request.

---

## Notes

- The discount math is mirrored in two places — `src/services/discountLogic.js`
  (server, source of truth for the real price rule) and `widget/widget.js` (client,
  for live display). Keep them in sync.
- Analytics fetches degrade gracefully to zeros if a Shopify call fails, so the
  dashboard never hard-errors on a transient API hiccup.
- `BILLING_TEST_MODE=true` until you're ready to charge real money.
