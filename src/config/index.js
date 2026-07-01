import dotenv from 'dotenv';

dotenv.config();

function required(name, fallback) {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    // Don't hard-crash in dev; warn loudly so misconfig is obvious.
    console.warn(`[config] Missing environment variable: ${name}`);
  }
  return value;
}

const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  appUrl: (process.env.APP_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, ''),

  shopify: {
    apiKey: required('SHOPIFY_API_KEY'),
    apiSecret: required('SHOPIFY_API_SECRET'),
    scopes: process.env.SHOPIFY_SCOPES ||
      'read_products,write_discounts,read_orders,write_script_tags,read_script_tags,write_customers,read_customers',
    apiVersion: process.env.SHOPIFY_API_VERSION || '2024-10',
  },

  db: {
    url: required('DATABASE_URL'),
    ssl: process.env.DATABASE_SSL === 'true',
  },

  security: {
    tokenEncryptionKey: process.env.TOKEN_ENCRYPTION_KEY ||
      '0000000000000000000000000000000000000000000000000000000000000000',
    sessionSecret: process.env.SESSION_SECRET || 'dev-insecure-session-secret',
  },

  billing: {
    feeRate: parseFloat(process.env.BILLING_FEE_RATE || '0.005'),
    testMode: process.env.BILLING_TEST_MODE !== 'false',
  },
};

export default config;
