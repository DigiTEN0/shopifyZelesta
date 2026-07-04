# BundleBoost — Privacy Policy

> ⚠️ **TEMPLATE — not legal advice.** Fill in every `[PLACEHOLDER]` and have a
> lawyer review it once. For the Shopify App Store this must be hosted at a
> public URL.

**Last updated:** [DATE]

This Privacy Policy explains how **[YOUR LEGAL NAME]** (KVK **[KVK NUMBER]**,
"Provider", "we") handles personal data in the **BundleBoost** app (the "App").

## 1. Our role
For data processed through the App on a merchant's store, the **merchant is the
data controller** and **we act as their processor** under a Data Processing
Agreement. This policy also describes our own processing as controller for
account/administration data.

## 2. What we process
- **Anonymous browsing data:** a randomly generated visitor identifier stored in
  the shopper's browser, session identifiers, and the products/pages viewed,
  including timestamps and product prices. We store **no name, email, or address**
  as part of this browsing data.
- **Lead data (only if the merchant enables the lead pop-up):** the email address
  and optional name a shopper submits, plus the products they were browsing.
- **Merchant/account data:** store domain, Shopify access token (encrypted at
  rest), and app settings.

## 3. Purposes and legal basis
- Browsing analytics and bundle suggestions — carried out on the merchant's
  instructions; on the storefront this relies on the shopper's **consent**
  (collected by the merchant's cookie/consent banner). We do not track until
  analytics consent is given.
- Lead capture and discounting — on the merchant's instructions and the shopper's
  consent.
- Running and securing the service — our legitimate interest / contract.

## 4. Consent
The App reads the storefront's consent signal (Shopify Customer Privacy API) and
**does not store any identifier or track any activity until analytics consent is
granted**. We display no banners or notices of our own.

## 5. Retention
Anonymous browsing data is automatically deleted after **[90] days**. Lead data is
kept until the merchant deletes it or the customer is redacted. On uninstall, shop
data is erased following Shopify's `shop/redact` (≈48 hours later).

## 6. Sub-processors
- **Shopify Inc.** — platform and hosting of storefront data.
- **[HOSTING PROVIDER, e.g. Railway]** — application hosting and database.
- **[ANY OTHERS]**

## 7. International transfers
Where data is transferred outside the EEA, it is protected by appropriate
safeguards (e.g. EU Standard Contractual Clauses).

## 8. Data-subject rights
Shoppers can exercise their rights (access, erasure, etc.) via the merchant. We
support the merchant through Shopify's GDPR webhooks (`customers/data_request`,
`customers/redact`, `shop/redact`).

## 9. Security
Access tokens are encrypted (AES-256-GCM), all traffic is over HTTPS, webhooks and
OAuth are HMAC-verified, admin APIs use signed session tokens, inputs are validated
and queries are parameterized.

## 10. Contact
Questions or requests: **[SUPPORT/PRIVACY EMAIL]**, **[YOUR LEGAL NAME]**,
**[ADDRESS]**.
