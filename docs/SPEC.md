# Bundle Widget — Final Product Spec

The consolidated, definitive specification this codebase implements. Use it as the
single source of truth (or as a build prompt to regenerate any part).

## Concept

A lightweight storefront widget tracks which products a visitor browses in a session.
After viewing **2+** products (configurable, max 5), a floating widget appears showing
those products as a suggested **bundle** with an automatic discount. One click adds
everything to cart. Revenue is tracked via unique auto-generated discount codes
(prefix `BUNDLE-`) so attribution is 100% clean. Direct install via URL — no App Store
listing required.

## Tech stack

- **Backend:** Node.js + Express
- **Dashboard:** React + Shopify Polaris (embedded, native to Shopify admin)
- **Widget:** vanilla JS, no frameworks, no dependencies, ultra-light, async-loaded
- **Database:** PostgreSQL (merchant tokens, settings, session data, bundle events)
- **Hosting:** Railway
- **Shopify:** OAuth 2.0, ScriptTag API, Cart AJAX API, Discount Code API, Orders API, Billing API

## Part 1 — Embedded dashboard (Polaris)

Sidebar: **Dashboard · Bundle Settings · Widget Customisation · Analytics · Billing**.

**Dashboard (home).** Hero stats (Bundle Revenue this month, Orders Influenced, AOV
Lift vs store average, Your Fee this month at 0.5% of bundle GMV). Live feed of recent
bundle orders (order #, products, discount, value). Green "Widget is live" banner when
active. Quick-setup checklist for new merchants.

**Bundle Settings.** Trigger-threshold slider (2–5). Discount type toggle
(percentage / fixed). Size tiers (2 / 3 / 4+ products). Maximum discount cap (hard
ceiling). Stacking rule (disable on sitewide sale). Minimum bundle value. Excluded
products/collections. **Bundle-value rules** — "if subtotal ≥ €X apply % or € off",
highest match wins.

**Widget Customisation.** Real-time live preview (uses the actual widget). Brand
colours (primary/accent). Position (bottom-left/right). Editable header, CTA, and badge
text. Font selector. Locale selector. Toggles: show prices, show crossed-out compare-at
price, savings as € vs %, redirect-to-cart. Demo-mode button (opens `/demo` in a new tab).

**Analytics.** Date range (this week / month / last month / custom). Charts: revenue
over time (line), bundles per day (bar), top-10 bundled products, widget trigger rate,
bundle conversion rate. All sourced from `BUNDLE-` orders. Export to CSV.

**Billing.** Performance plan (0.5% of attributed bundle GMV). Current-month estimated
fee. 6-month fee history. Shopify Billing API. Clear attribution explanation.

## Part 2 — Storefront widget (vanilla JS, ScriptTag)

Runs silently on every page; detects product pages; stores viewed products in
`localStorage` (id, title, image, price, url, variants) with no duplicates. After the
threshold, the widget animates in and updates live as browsing continues; the session
resets on checkout completion.

- **Collapsed:** floating pill with up to 3 stacked product thumbnails (deck-of-cards
  overlap), bounce-in entrance, `Save X%` badge in the brand colour, subtle pulse. New
  products slide in and join the stack with a small celebratory animation.
- **Expanded:** spring-opens into a panel — header, product list (thumbnail, name,
  price, **variant selectors**, **quantity steppers**, **remove ✕**), divider, original
  total crossed out, discounted total in bold brand colour, "You save €X", full-width
  CTA, "Discount applied automatically" trust text.
- **On CTA:** generate a unique `BUNDLE-[6char]-[ts]` code via the backend → add all
  to cart via AJAX → apply the code → checkmark success state → optional redirect to
  cart (configurable).
- Fully responsive — anchors as a **bottom sheet** on mobile. Zero impact on page load.

## Part 3 — Backend (Express)

Routes: `GET /auth/shopify`, `GET /auth/callback`, `POST /api/discount/generate`,
`GET /api/settings/:shop`, `POST /api/settings/:shop`, `GET /api/analytics/:shop`,
`POST /api/billing/activate`, `GET /api/billing/usage/:shop` (plus `/install`,
`/api/events`, webhooks).

Security: verify Shopify webhook HMAC; validate shop domain on every request; store
access tokens encrypted in PostgreSQL; rate-limit discount generation; verify embedded
session-token JWTs for admin routes.

## Part 4 — Install flow

Merchant visits `/install?shop=store.myshopify.com` → OAuth completes → ScriptTag
auto-registered → redirected into the embedded dashboard → setup checklist → widget
live within ~2 minutes.

## Demo mode

`/demo` simulates a store with three products already viewed (duvet, pillowcase, fitted
sheet) and shows the widget expanded — pure frontend, no Shopify connection. Built for
sales demos and Loom recordings.

## Design direction

- **Dashboard:** clean, minimal, data-forward (Linear/Stripe feel), all Polaris so it's
  native. Loading skeletons everywhere; helpful empty states.
- **Widget:** premium DTC feel — smooth animations, generous whitespace, confident
  typography. Every interaction intentional and fast.
