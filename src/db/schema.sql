-- ─────────────────────────────────────────────────────────────
-- Bundle Widget App — PostgreSQL schema
-- Idempotent: safe to run repeatedly (used by the migration runner).
-- ─────────────────────────────────────────────────────────────

-- Installed merchants and their (encrypted) Admin API tokens.
CREATE TABLE IF NOT EXISTS shops (
  id                BIGSERIAL PRIMARY KEY,
  shop_domain       TEXT UNIQUE NOT NULL,
  access_token_enc  TEXT,                 -- AES-256-GCM ciphertext (iv:tag:data)
  scope             TEXT,
  script_tag_id     BIGINT,               -- id of the injected ScriptTag
  plan              TEXT DEFAULT 'performance',
  installed_at      TIMESTAMPTZ DEFAULT now(),
  uninstalled_at    TIMESTAMPTZ,
  updated_at        TIMESTAMPTZ DEFAULT now()
);

-- One settings row per shop. Bundle logic + widget look-and-feel.
CREATE TABLE IF NOT EXISTS settings (
  shop_domain       TEXT PRIMARY KEY REFERENCES shops(shop_domain) ON DELETE CASCADE,

  -- Bundle behaviour
  trigger_threshold INT     DEFAULT 2,        -- products viewed before widget shows (2..5)
  discount_type     TEXT    DEFAULT 'percentage', -- 'percentage' | 'fixed'
  tiers             JSONB   DEFAULT '{"2":10,"3":15,"4":20}'::jsonb, -- products -> discount
  value_rules       JSONB   DEFAULT '[]'::jsonb, -- [{min_value, type, amount}] bundle-value rules
  max_discount_cap  NUMERIC DEFAULT 40,        -- hard ceiling (% or currency depending on type)
  disable_when_sale BOOLEAN DEFAULT false,     -- don't stack on top of a sitewide sale
  min_bundle_value  NUMERIC DEFAULT 0,         -- only trigger above this cart value
  excluded          JSONB   DEFAULT '{"products":[],"collections":[]}'::jsonb,

  -- Widget customisation
  primary_color     TEXT    DEFAULT '#111827',
  secondary_color   TEXT    DEFAULT '#6366F1',
  position          TEXT    DEFAULT 'bottom-right', -- 'bottom-left' | 'bottom-right'
  header_text       TEXT    DEFAULT 'Your Bundle',
  cta_text          TEXT    DEFAULT 'Add All to Cart & Save',
  badge_text        TEXT    DEFAULT 'Save {amount}',
  font_family       TEXT    DEFAULT 'inherit',
  locale            TEXT    DEFAULT 'en',
  show_prices       BOOLEAN DEFAULT true,
  show_compare_at   BOOLEAN DEFAULT true,
  savings_as        TEXT    DEFAULT 'currency', -- 'currency' | 'percentage'
  redirect_to_cart  BOOLEAN DEFAULT false,
  currency          TEXT    DEFAULT 'EUR',

  -- Lead-capture pop-up (shown before the bundle reveal)
  popup_enabled       BOOLEAN DEFAULT false,
  popup_discount      NUMERIC DEFAULT 10,        -- headline welcome discount (% or fixed)
  popup_discount_type TEXT    DEFAULT 'percentage',
  popup_headline      TEXT    DEFAULT '',   -- empty => use the translated default
  popup_subheadline   TEXT    DEFAULT '',
  popup_button        TEXT    DEFAULT '',
  popup_decline       TEXT    DEFAULT '',
  popup_image         TEXT    DEFAULT '',
  popup_collect_name  BOOLEAN DEFAULT true,
  popup_delay_seconds INT     DEFAULT 6,

  enabled           BOOLEAN DEFAULT false,   -- merchant activates the widget themselves
  updated_at        TIMESTAMPTZ DEFAULT now()
);

-- Captured leads: email + the browse intent (what they viewed) + the code.
CREATE TABLE IF NOT EXISTS leads (
  id                  BIGSERIAL PRIMARY KEY,
  shop_domain         TEXT NOT NULL REFERENCES shops(shop_domain) ON DELETE CASCADE,
  email               TEXT NOT NULL,
  name                TEXT,
  session_id          TEXT,
  product_ids         JSONB DEFAULT '[]'::jsonb,
  product_titles      JSONB DEFAULT '[]'::jsonb,
  discount_code       TEXT,
  mode                TEXT,                       -- 'bundle' | 'single' | 'welcome'
  shopify_customer_id BIGINT,
  created_at          TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_leads_shop ON leads(shop_domain);
CREATE INDEX IF NOT EXISTS idx_leads_created ON leads(created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_shop_email ON leads(shop_domain, email);

-- Every unique discount code we mint, for clean attribution.
CREATE TABLE IF NOT EXISTS discount_codes (
  id              BIGSERIAL PRIMARY KEY,
  shop_domain     TEXT NOT NULL REFERENCES shops(shop_domain) ON DELETE CASCADE,
  code            TEXT UNIQUE NOT NULL,         -- BUNDLE-XXXXXX-<ts>
  price_rule_id   BIGINT,
  discount_id     BIGINT,
  discount_type   TEXT,
  discount_value  NUMERIC,
  product_ids     JSONB DEFAULT '[]'::jsonb,
  bundle_value    NUMERIC,
  session_id      TEXT,
  redeemed        BOOLEAN DEFAULT false,
  order_id        BIGINT,
  order_total     NUMERIC,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_discount_codes_shop ON discount_codes(shop_domain);
CREATE INDEX IF NOT EXISTS idx_discount_codes_created ON discount_codes(created_at);

-- Funnel events for analytics: widget impressions and add-to-cart conversions.
CREATE TABLE IF NOT EXISTS bundle_events (
  id            BIGSERIAL PRIMARY KEY,
  shop_domain   TEXT NOT NULL REFERENCES shops(shop_domain) ON DELETE CASCADE,
  session_id    TEXT,
  event_type    TEXT NOT NULL,               -- 'widget_shown' | 'add_to_cart'
  product_ids   JSONB DEFAULT '[]'::jsonb,
  product_count INT,
  bundle_value  NUMERIC,
  discount_code TEXT,
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_events_shop ON bundle_events(shop_domain);
CREATE INDEX IF NOT EXISTS idx_events_type ON bundle_events(event_type);
CREATE INDEX IF NOT EXISTS idx_events_created ON bundle_events(created_at);

-- Billing subscription state per shop.
CREATE TABLE IF NOT EXISTS billing (
  shop_domain      TEXT PRIMARY KEY REFERENCES shops(shop_domain) ON DELETE CASCADE,
  subscription_id  BIGINT,
  status           TEXT DEFAULT 'pending',    -- pending | active | cancelled
  confirmation_url TEXT,
  activated_at     TIMESTAMPTZ,
  updated_at       TIMESTAMPTZ DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────
-- In-place upgrades for databases created before a column existed.
-- ADD COLUMN IF NOT EXISTS is idempotent, so this is safe on every deploy.
-- ─────────────────────────────────────────────────────────────
ALTER TABLE settings ADD COLUMN IF NOT EXISTS popup_enabled       BOOLEAN DEFAULT false;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS popup_discount      NUMERIC DEFAULT 10;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS popup_discount_type TEXT    DEFAULT 'percentage';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS popup_headline      TEXT    DEFAULT '';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS popup_subheadline   TEXT    DEFAULT '';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS popup_button        TEXT    DEFAULT '';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS popup_decline       TEXT    DEFAULT '';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS popup_image         TEXT    DEFAULT '';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS popup_collect_name  BOOLEAN DEFAULT true;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS popup_delay_seconds INT     DEFAULT 6;
