/* ============================================================================
 * Bundle Widget — storefront script (vanilla JS, zero dependencies)
 *
 * One source of truth for the widget UI. Runs in two modes:
 *   • LIVE  — injected via Shopify ScriptTag. Detects product pages, tracks
 *             browsing in localStorage, talks to the app backend.
 *   • DEMO  — driven by window.BundleWidgetConfig (used by /demo and the
 *             dashboard live preview). No network, hardcoded products.
 *
 * Loaded async; never blocks page render.
 * ========================================================================== */
(function () {
  'use strict';

  if (window.__BUNDLE_WIDGET_LOADED__) return;
  window.__BUNDLE_WIDGET_LOADED__ = true;

  // ── Resolve app origin from this script's own <script src> ───────────────
  function appOrigin() {
    if (window.BundleWidgetConfig && window.BundleWidgetConfig.appUrl) {
      return window.BundleWidgetConfig.appUrl.replace(/\/$/, '');
    }
    const cur = document.currentScript || [].slice.call(document.scripts).pop();
    try {
      return new URL(cur.src).origin;
    } catch (e) {
      return '';
    }
  }

  const APP_URL = appOrigin();

  // ── Default settings (overridden by backend / demo config) ───────────────
  const DEFAULTS = {
    triggerThreshold: 2,
    discountType: 'percentage',
    tiers: { 2: 10, 3: 15, 4: 20 },
    valueRules: [],
    maxDiscountCap: 40,
    disableWhenSale: false,
    minBundleValue: 0,
    excluded: { products: [], collections: [] },
    primaryColor: '#111827',
    secondaryColor: '#6366F1',
    position: 'bottom-right',
    headerText: 'Your Bundle',
    ctaText: 'Add All to Cart & Save',
    badgeText: 'Save {amount}',
    fontFamily: 'inherit',
    locale: 'en',
    showPrices: true,
    showCompareAt: true,
    savingsAs: 'currency',
    redirectToCart: false,
    currency: 'EUR',
    enabled: true,
  };

  /* ======================================================================== */
  /*  Pure discount math — mirrors src/services/discountLogic.js              */
  /* ======================================================================== */
  function computeDiscount(items, s) {
    const subtotal = items.reduce((sum, it) => sum + it.price * (it.quantity || 1), 0);
    const distinct = items.length;
    const out = {
      subtotal,
      discountType: s.discountType,
      discountAmount: 0,
      total: subtotal,
      percentOff: 0,
      eligible: false,
      reason: null,
    };
    if (subtotal < toCents(s.minBundleValue)) {
      out.reason = 'below_min_value';
      return out;
    }
    const tierValue = resolveTier(s.tiers, distinct);
    const rule = pickValueRule(s.valueRules, subtotal);
    let type = s.discountType;
    let value = tierValue;
    if (rule) {
      type = rule.type || s.discountType;
      value = Number(rule.amount);
    }
    if (!value || value <= 0) {
      out.reason = 'no_discount';
      return out;
    }
    let amount, pct;
    if (type === 'percentage') {
      pct = clamp(value, 0, Number(s.maxDiscountCap || 100));
      amount = (subtotal * pct) / 100;
    } else {
      const capCents = toCents(s.maxDiscountCap);
      const valCents = toCents(value);
      amount = Math.min(capCents > 0 ? Math.min(valCents, capCents) : valCents, subtotal);
      pct = subtotal > 0 ? (amount / subtotal) * 100 : 0;
    }
    out.eligible = amount > 0;
    out.discountType = type;
    out.discountAmount = Math.round(amount);
    out.percentOff = Math.round(pct);
    out.total = Math.max(0, subtotal - out.discountAmount);
    return out;
  }
  function resolveTier(tiers, count) {
    if (!tiers) return 0;
    const keys = Object.keys(tiers).map(Number).filter((n) => !isNaN(n)).sort((a, b) => a - b);
    if (!keys.length || count < keys[0]) return 0;
    let chosen = 0;
    keys.forEach((k) => { if (count >= k) chosen = Number(tiers[k]); });
    return chosen;
  }
  function pickValueRule(rules, subtotal) {
    if (!Array.isArray(rules) || !rules.length) return null;
    return rules
      .filter((r) => subtotal >= toCents(r.min_value != null ? r.min_value : r.minValue))
      .sort((a, b) => toCents(b.min_value != null ? b.min_value : b.minValue) - toCents(a.min_value != null ? a.min_value : a.minValue))[0] || null;
  }
  function toCents(v) { return Math.round(Number(v || 0) * 100); }
  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

  /* ======================================================================== */
  /*  Storage (browse session)                                                */
  /* ======================================================================== */
  const STORAGE_KEY = 'bundle_widget_session_v1';

  function loadSession() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return { sessionId: genId(), products: [], dismissed: false };
  }
  function saveSession(s) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch (e) {}
  }
  function clearSession() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
  }
  function genId() {
    return 'bw_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  /* ======================================================================== */
  /*  Money formatting                                                        */
  /* ======================================================================== */
  function money(cents, s) {
    const amount = (cents || 0) / 100;
    try {
      return new Intl.NumberFormat(s.locale || 'en', {
        style: 'currency',
        currency: s.currency || 'EUR',
      }).format(amount);
    } catch (e) {
      return (s.currency || 'EUR') + ' ' + amount.toFixed(2);
    }
  }

  /* ======================================================================== */
  /*  Localisation of the widget's own UI strings                             */
  /* ======================================================================== */
  const I18N = {
    en: { bundled: '{n} products bundled', discountApplied: 'discount applied', original: 'Original total', bundlePrice: 'Bundle price', save: 'You save {x}', autoApplied: 'Discount applied automatically at checkout', addedTitle: 'Bundle added!', addedBody: 'Your {x} discount is locked in and applied at checkout.', viewCart: 'View cart & checkout', keepShopping: 'Continue shopping', emptyTitle: 'Your bundle is empty.', emptyBody: 'Browse a few products to build one.' },
    nl: { bundled: '{n} producten gebundeld', discountApplied: 'korting toegepast', original: 'Oorspronkelijk totaal', bundlePrice: 'Bundelprijs', save: 'Je bespaart {x}', autoApplied: 'Korting wordt automatisch toegepast bij het afrekenen', addedTitle: 'Bundel toegevoegd!', addedBody: 'Je korting van {x} is vastgezet en wordt toegepast bij het afrekenen.', viewCart: 'Winkelwagen bekijken & afrekenen', keepShopping: 'Verder winkelen', emptyTitle: 'Je bundel is leeg.', emptyBody: 'Bekijk een paar producten om er een te maken.' },
    de: { bundled: '{n} Produkte gebündelt', discountApplied: 'Rabatt angewendet', original: 'Ursprünglicher Gesamtpreis', bundlePrice: 'Bündelpreis', save: 'Du sparst {x}', autoApplied: 'Rabatt wird automatisch an der Kasse angewendet', addedTitle: 'Bündel hinzugefügt!', addedBody: 'Dein Rabatt von {x} ist gesichert und wird an der Kasse angewendet.', viewCart: 'Warenkorb ansehen & zur Kasse', keepShopping: 'Weiter einkaufen', emptyTitle: 'Dein Bündel ist leer.', emptyBody: 'Sieh dir ein paar Produkte an, um eins zu erstellen.' },
    fr: { bundled: '{n} produits regroupés', discountApplied: 'réduction appliquée', original: 'Total initial', bundlePrice: 'Prix du lot', save: 'Vous économisez {x}', autoApplied: 'Réduction appliquée automatiquement au paiement', addedTitle: 'Lot ajouté !', addedBody: 'Votre réduction de {x} est garantie et appliquée au paiement.', viewCart: 'Voir le panier et payer', keepShopping: 'Continuer mes achats', emptyTitle: 'Votre lot est vide.', emptyBody: 'Parcourez quelques produits pour en créer un.' },
    es: { bundled: '{n} productos agrupados', discountApplied: 'descuento aplicado', original: 'Total original', bundlePrice: 'Precio del paquete', save: 'Ahorras {x}', autoApplied: 'El descuento se aplica automáticamente al pagar', addedTitle: '¡Paquete añadido!', addedBody: 'Tu descuento de {x} está asegurado y se aplica al pagar.', viewCart: 'Ver carrito y pagar', keepShopping: 'Seguir comprando', emptyTitle: 'Tu paquete está vacío.', emptyBody: 'Explora algunos productos para crear uno.' },
  };
  function t(locale, key, vars) {
    const dict = I18N[(locale || 'en').slice(0, 2)] || I18N.en;
    let s = dict[key] || I18N.en[key] || key;
    if (vars) for (const k in vars) s = s.split('{' + k + '}').join(vars[k]);
    return s;
  }

  /* ======================================================================== */
  /*  Styles (injected once; uses CSS variables for theming)                  */
  /* ======================================================================== */
  function injectStyles() {
    if (document.getElementById('bw-styles')) return;
    const css = `
:root{--bw-primary:#111827;--bw-secondary:#6366F1;--bw-radius:18px;}
.bw-root,.bw-root *{box-sizing:border-box;}
.bw-root{position:fixed;z-index:2147483000;font-family:var(--bw-font, -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif);-webkit-font-smoothing:antialiased;color:#111827;}
.bw-root.bw-right{right:22px;bottom:22px;}
.bw-root.bw-left{left:22px;bottom:22px;}

/* ── Collapsed pill ── */
.bw-pill{display:inline-flex;align-items:center;gap:5px;background:#fff;border:1px solid rgba(17,24,39,.06);
  box-shadow:0 10px 30px -12px rgba(17,24,39,.28),0 2px 8px -4px rgba(17,24,39,.14);
  border-radius:999px;padding:6px 12px 6px 7px;cursor:pointer;
  transition:transform .2s ease,box-shadow .2s ease;}
.bw-pill-count{font-size:12px;font-weight:700;color:#374151;padding-right:2px;}
.bw-pill.bw-animate{animation:bw-bounce-in .7s cubic-bezier(.18,.89,.32,1.28) both;}
.bw-pill:hover{transform:translateY(-3px) scale(1.02);box-shadow:0 22px 50px -14px rgba(17,24,39,.42);}
.bw-stack{position:relative;width:72px;height:38px;flex:0 0 auto;}
.bw-thumb{position:absolute;top:0;width:38px;height:38px;border-radius:50%;object-fit:cover;background:#f3f4f6;
  border:2px solid #fff;box-shadow:0 3px 8px -2px rgba(17,24,39,.3);transition:transform .35s cubic-bezier(.18,.89,.32,1.28);}
.bw-thumb.bw-new{animation:bw-slide-join .5s cubic-bezier(.18,.89,.32,1.28) both;}
.bw-pill-text{display:flex;flex-direction:column;line-height:1.15;}
.bw-pill-title{font-size:13px;font-weight:700;letter-spacing:-.01em;}
.bw-pill-sub{font-size:11.5px;color:#6b7280;font-weight:500;}
.bw-badge{margin-left:2px;background:var(--bw-secondary);color:#fff;font-size:11px;font-weight:800;
  padding:5px 10px;border-radius:999px;white-space:nowrap;box-shadow:0 4px 10px -3px var(--bw-secondary);
  animation:bw-pulse 2.4s ease-in-out infinite;}
.bw-pill-close{position:absolute;top:-7px;right:-7px;width:20px;height:20px;border-radius:50%;background:#111827;color:#fff;
  border:2px solid #fff;font-size:11px;display:none;align-items:center;justify-content:center;cursor:pointer;}
.bw-pill:hover .bw-pill-close{display:flex;}

/* ── Expanded panel ── */
.bw-panel{position:relative;width:380px;max-width:calc(100vw - 32px);background:#fff;border-radius:var(--bw-radius);overflow:hidden;
  box-shadow:0 30px 80px -20px rgba(17,24,39,.5),0 8px 20px -10px rgba(17,24,39,.25);
  border:1px solid rgba(17,24,39,.06);transform-origin:bottom right;}
.bw-panel.bw-animate{animation:bw-spring-up .42s cubic-bezier(.16,1,.3,1) both;}
.bw-root.bw-left .bw-panel{transform-origin:bottom left;}
.bw-head{position:relative;padding:18px 20px 16px;background:var(--bw-primary);color:#fff;}
.bw-head-row{display:flex;align-items:center;justify-content:space-between;}
.bw-head-title{font-size:15px;font-weight:700;letter-spacing:-.01em;display:flex;align-items:center;gap:9px;}
.bw-head-dot{width:8px;height:8px;border-radius:50%;background:var(--bw-secondary);box-shadow:0 0 0 4px rgba(255,255,255,.14);}
.bw-head-sub{margin-top:4px;font-size:12px;opacity:.7;}
.bw-collapse{background:rgba(255,255,255,.12);border:none;color:#fff;width:30px;height:30px;border-radius:9px;cursor:pointer;font-size:16px;line-height:1;transition:background .2s;}
.bw-collapse:hover{background:rgba(255,255,255,.22);}

.bw-items{max-height:46vh;overflow-y:auto;padding:8px 8px 4px;}
.bw-item{display:flex;gap:12px;padding:12px;border-radius:14px;position:relative;transition:background .2s;}
.bw-item:hover{background:#f9fafb;}
.bw-item+.bw-item{border-top:1px solid #f1f2f4;}
.bw-item-img{width:56px;height:56px;border-radius:12px;object-fit:cover;background:#f1f1f2;flex:0 0 auto;}
.bw-item-body{flex:1;min-width:0;}
.bw-item-top{display:flex;align-items:baseline;justify-content:space-between;gap:10px;margin:1px 20px 9px 0;}
.bw-item-title{font-size:13.5px;font-weight:650;line-height:1.3;color:#111827;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}
.bw-item-price{font-size:13px;font-weight:700;color:var(--bw-primary);white-space:nowrap;flex:0 0 auto;}
.bw-item-compare{font-size:11.5px;color:#9ca3af;text-decoration:line-through;margin-left:5px;font-weight:500;}
.bw-remove{position:absolute;top:12px;right:10px;width:20px;height:20px;border:none;background:transparent;color:#c4c4c8;cursor:pointer;font-size:16px;line-height:1;display:flex;align-items:center;justify-content:center;transition:color .15s;}
.bw-remove:hover{color:#dc2626;}
.bw-item-controls{display:flex;align-items:center;gap:7px;flex-wrap:wrap;}
.bw-opts{display:flex;gap:7px;flex:1 1 auto;min-width:0;}
.bw-opts-multi{flex:1 1 100%;}
.bw-select{appearance:none;-webkit-appearance:none;background:#fff url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%236b7280' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E") no-repeat right 9px center;
  border:1px solid #e6e6e9;border-radius:9px;padding:7px 26px 7px 11px;font-size:12.5px;font-weight:600;color:#374151;cursor:pointer;flex:1 1 84px;min-width:80px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.bw-select:focus{outline:none;border-color:var(--bw-primary);box-shadow:0 0 0 3px rgba(17,24,39,.07);}
.bw-qty{display:inline-flex;align-items:center;border:1px solid #e6e6e9;border-radius:9px;overflow:hidden;flex:0 0 auto;margin-left:auto;}
.bw-qty button{width:26px;height:30px;border:none;background:#fff;cursor:pointer;font-size:15px;color:#374151;line-height:1;transition:background .15s;}
.bw-qty button:hover{background:#f3f4f6;}
.bw-qty span{min-width:26px;text-align:center;font-size:12.5px;font-weight:700;}

.bw-foot{padding:16px 20px 18px;border-top:1px solid #f1f2f4;background:#fff;}
.bw-totals{display:flex;flex-direction:column;gap:5px;margin-bottom:14px;}
.bw-row{display:flex;justify-content:space-between;align-items:baseline;font-size:13px;color:#8a8a8f;}
.bw-row .bw-strike{text-decoration:line-through;}
.bw-total-row{margin-top:4px;}
.bw-total-label{font-size:14px;font-weight:650;color:#111827;}
.bw-total-val{font-size:23px;font-weight:800;color:var(--bw-primary);letter-spacing:-.02em;}
.bw-savings{align-self:flex-start;margin-top:5px;background:rgba(17,24,39,.05);color:var(--bw-secondary);
  font-size:12px;font-weight:700;padding:6px 12px;border-radius:8px;}
.bw-cta{width:100%;border:none;border-radius:12px;background:var(--bw-primary);color:#fff;font-size:14.5px;font-weight:700;
  padding:15px;cursor:pointer;letter-spacing:-.01em;transition:transform .15s ease,opacity .2s ease;}
.bw-cta:hover{transform:translateY(-1px);opacity:.93;}
.bw-cta:active{transform:translateY(0);}
.bw-cta:disabled{opacity:.45;cursor:default;transform:none;}
.bw-trust{text-align:center;font-size:11.5px;color:#a5a5aa;margin-top:11px;}

/* ── Success state ── */
.bw-success-close{position:absolute;top:12px;right:12px;z-index:2;width:30px;height:30px;border-radius:9px;border:none;background:#f3f4f6;color:#6b7280;font-size:17px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background .15s;}
.bw-success-close:hover{background:#e5e7eb;}
.bw-success-continue{width:100%;margin-top:9px;border:none;background:transparent;color:#8a8a8f;font-size:12.5px;font-weight:600;cursor:pointer;padding:6px;}
.bw-success-continue:hover{color:#374151;}
.bw-success{padding:38px 24px 22px;text-align:center;animation:bw-fade-in .3s ease both;}
.bw-check{width:64px;height:64px;margin:0 auto 16px;border-radius:50%;background:var(--bw-secondary);display:flex;align-items:center;justify-content:center;animation:bw-pop .5s cubic-bezier(.18,.89,.32,1.28) both;}
.bw-check svg{width:32px;height:32px;}
.bw-check path{stroke-dasharray:30;stroke-dashoffset:30;animation:bw-draw .5s .2s ease forwards;}
.bw-success h3{margin:0 0 6px;font-size:18px;font-weight:800;letter-spacing:-.01em;}
.bw-success p{margin:0 0 18px;font-size:13px;color:#6b7280;line-height:1.5;}
.bw-code{display:inline-block;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px;font-weight:700;
  background:#f3f4f6;border:1px dashed #d1d5db;border-radius:8px;padding:6px 12px;margin-bottom:18px;color:#374151;}
.bw-empty{padding:36px 24px;text-align:center;color:#9ca3af;font-size:13px;}

/* ── Mobile ── */
@media(max-width:560px){
  /* Collapsed pill keeps the corner you picked in the dashboard */
  .bw-root.bw-collapsed.bw-left{left:14px;right:auto;bottom:14px;}
  .bw-root.bw-collapsed.bw-right{right:14px;left:auto;bottom:14px;}
  /* Expanded opens as a full-width bottom sheet */
  .bw-root.bw-expanded{left:0;right:0;bottom:0;}
  .bw-panel{width:100%;max-width:100%;border-radius:22px 22px 0 0;}
  .bw-panel.bw-animate{animation:bw-sheet-up .4s cubic-bezier(.16,1,.3,1) both;}
  .bw-items{max-height:50vh;}
}

/* ── Keyframes ── */
@keyframes bw-bounce-in{0%{opacity:0;transform:translateY(40px) scale(.8);}60%{opacity:1;transform:translateY(-6px) scale(1.04);}100%{transform:translateY(0) scale(1);}}
@keyframes bw-slide-join{0%{opacity:0;transform:translateX(26px) scale(.6) rotate(8deg);}100%{opacity:1;transform:translateX(0) scale(1) rotate(0);}}
@keyframes bw-pulse{0%,100%{box-shadow:0 4px 10px -3px var(--bw-secondary),0 0 0 0 rgba(99,102,241,.45);}50%{box-shadow:0 4px 10px -3px var(--bw-secondary),0 0 0 7px rgba(99,102,241,0);}}
@keyframes bw-spring-up{0%{opacity:0;transform:translateY(30px) scale(.92);}100%{opacity:1;transform:translateY(0) scale(1);}}
@keyframes bw-sheet-up{0%{transform:translateY(100%);}100%{transform:translateY(0);}}
@keyframes bw-fade-in{from{opacity:0;}to{opacity:1;}}
@keyframes bw-pop{0%{transform:scale(0);}100%{transform:scale(1);}}
@keyframes bw-draw{to{stroke-dashoffset:0;}}
@media(prefers-reduced-motion:reduce){.bw-root *{animation-duration:.001ms!important;}}
`;
    const el = document.createElement('style');
    el.id = 'bw-styles';
    el.textContent = css;
    document.head.appendChild(el);
  }

  /* ======================================================================== */
  /*  Widget controller                                                       */
  /* ======================================================================== */
  function BundleWidget(opts) {
    this.shop = opts.shop;
    this.settings = Object.assign({}, DEFAULTS, opts.settings || {});
    this.session = opts.session || loadSession();
    this.demo = !!opts.demo;
    this.preview = !!opts.preview;            // dashboard live preview (no cart actions)
    this.onChange = opts.onChange || function () {};
    this.expanded = !!opts.startExpanded;
    this.root = null;
    this._prevCount = this.session.products.length;
    this._animateNext = true; // play entrance on first paint
  }

  BundleWidget.prototype.boot = function () {
    injectStyles();
    this.render();
  };

  BundleWidget.prototype.applySettings = function (settings) {
    this.settings = Object.assign({}, DEFAULTS, settings || {});
    this.render();
  };

  // Add a product to the bundle (dedup by product id). Returns true if added.
  BundleWidget.prototype.addProduct = function (product) {
    if (!product || !product.id) return false;
    if (this.session.products.some((p) => String(p.id) === String(product.id))) return false;
    if ((this.settings.excluded.products || []).map(String).includes(String(product.id))) return false;
    this.session.products.push(normalizeProduct(product));
    saveSession(this.session);
    this._animateNext = true;
    this.render(true);
    return true;
  };

  BundleWidget.prototype.removeProduct = function (id) {
    this.session.products = this.session.products.filter((p) => String(p.id) !== String(id));
    saveSession(this.session);
    this.render();
  };

  BundleWidget.prototype.selectedItems = function () {
    return this.session.products.map((p) => {
      const v = currentVariant(p);
      return {
        productId: p.id,
        variantId: v ? v.id : p.selectedVariantId,
        title: p.title,
        price: v ? v.price : p.price,
        quantity: p.quantity || 1,
        image: p.image,
      };
    });
  };

  BundleWidget.prototype.render = function (animateAdd) {
    const s = this.settings;
    if (!s.enabled && !this.preview) { this.destroy(); return; }

    const count = this.session.products.length;
    const meetsThreshold = this.preview || count >= s.triggerThreshold;
    if (!meetsThreshold || this.session.dismissed) { this.destroy(); return; }

    if (!this.root) {
      this.root = document.createElement('div');
      document.body.appendChild(this.root);
      if (!this.demo && !this.preview) this._emitShown();
    }
    this.root.className = 'bw-root ' + (s.position === 'bottom-left' ? 'bw-left' : 'bw-right') +
      (this.expanded ? ' bw-expanded' : ' bw-collapsed');
    this.root.style.setProperty('--bw-primary', s.primaryColor);
    this.root.style.setProperty('--bw-secondary', s.secondaryColor);
    if (s.fontFamily && s.fontFamily !== 'inherit') this.root.style.setProperty('--bw-font', s.fontFamily);
    else this.root.style.removeProperty('--bw-font');

    // Only play the entrance animation on first show / expand — not on every
    // in-place update (quantity, variant), which otherwise looks like a flicker.
    const entrance = this._animateNext;
    this._animateNext = false;

    this.root.innerHTML = this.expanded ? this._panelHTML(entrance) : this._pillHTML(animateAdd, entrance);
    this._bind();
    this._prevCount = count;
    this.onChange(this.snapshot());
  };

  BundleWidget.prototype.snapshot = function () {
    const items = this.selectedItems();
    return { items, calc: computeDiscount(items, this.settings) };
  };

  BundleWidget.prototype._pillHTML = function (animateAdd, entrance) {
    const s = this.settings;
    const items = this.selectedItems();
    const calc = computeDiscount(items, s);
    const thumbs = this.session.products.slice(0, 3).map((p, i) => {
      const isNew = animateAdd && i === this.session.products.length - 1 && this.session.products.length <= 3;
      return `<img class="bw-thumb ${isNew ? 'bw-new' : ''}" style="left:${i * 17}px;z-index:${3 - i}" src="${esc(p.image)}" alt="">`;
    }).join('');
    const badge = badgeLabel(s, calc);
    return `
      <div class="bw-pill${entrance ? ' bw-animate' : ''}" data-act="expand" title="${esc(s.headerText)}">
        <div class="bw-stack">${thumbs}</div>
        ${calc.eligible
          ? `<span class="bw-badge">${esc(badge)}</span>`
          : `<span class="bw-pill-count">${this.session.products.length}</span>`}
      </div>`;
  };

  BundleWidget.prototype._panelHTML = function (entrance) {
    const s = this.settings;
    const items = this.selectedItems();
    const calc = computeDiscount(items, s);
    const anim = entrance ? ' bw-animate' : '';

    if (this.session.products.length === 0) {
      return `<div class="bw-panel${anim}"><div class="bw-head"><div class="bw-head-row">
        <div class="bw-head-title"><span class="bw-head-dot"></span>${esc(s.headerText)}</div>
        <button class="bw-collapse" data-act="collapse">&times;</button></div></div>
        <div class="bw-empty">${esc(t(s.locale, 'emptyTitle'))}<br>${esc(t(s.locale, 'emptyBody'))}</div></div>`;
    }

    const rows = this.session.products.map((p) => this._itemHTML(p, s)).join('');
    const savings = s.savingsAs === 'percentage'
      ? `${calc.percentOff}%`
      : money(calc.discountAmount, s);

    return `
      <div class="bw-panel${anim}">
        <div class="bw-head">
          <div class="bw-head-row">
            <div class="bw-head-title"><span class="bw-head-dot"></span>${esc(s.headerText)}</div>
            <button class="bw-collapse" data-act="collapse" title="Minimise">&times;</button>
          </div>
          <div class="bw-head-sub">${esc(t(s.locale, 'bundled', { n: this.session.products.length }))}${calc.eligible ? ' • ' + esc(t(s.locale, 'discountApplied')) : ''}</div>
        </div>
        <div class="bw-items">${rows}</div>
        <div class="bw-foot">
          <div class="bw-totals">
            ${s.showPrices ? `<div class="bw-row"><span>${esc(t(s.locale, 'original'))}</span><span class="bw-strike">${money(calc.subtotal, s)}</span></div>` : ''}
            <div class="bw-row bw-total-row"><span class="bw-total-label">${esc(t(s.locale, 'bundlePrice'))}</span><span class="bw-total-val">${money(calc.total, s)}</span></div>
            ${calc.eligible ? `<span class="bw-savings">${esc(t(s.locale, 'save', { x: savings }))}</span>` : ''}
          </div>
          <button class="bw-cta" data-act="checkout" ${calc.eligible ? '' : 'disabled'}>${esc(s.ctaText).split('{savings}').join(esc(savings))}</button>
          <div class="bw-trust">${esc(t(s.locale, 'autoApplied'))}</div>
        </div>
      </div>`;
  };

  BundleWidget.prototype._itemHTML = function (p, s) {
    const v = currentVariant(p);
    const price = v ? v.price : p.price;
    const compare = v && v.compareAtPrice ? v.compareAtPrice : p.compareAtPrice;
    const hasOptions = p.options && p.options.length && !(p.options.length === 1 && /default/i.test(p.options[0].values[0] || ''));

    let optsHTML = '';
    if (hasOptions) {
      optsHTML = `<div class="bw-opts${p.options.length >= 2 ? ' bw-opts-multi' : ''}">` + p.options.map((opt, oi) => {
        const selected = (v && v.optionValues && v.optionValues[oi]) || opt.values[0];
        return `<select class="bw-select" data-opt="${oi}" data-id="${esc(p.id)}">` +
          opt.values.map((val) => `<option ${val === selected ? 'selected' : ''}>${esc(val)}</option>`).join('') +
          '</select>';
      }).join('') + '</div>';
    }

    const priceHTML = s.showPrices
      ? `<div class="bw-item-price">${money(price, s)}${s.showCompareAt && compare && compare > price ? `<span class="bw-item-compare">${money(compare, s)}</span>` : ''}</div>`
      : '';

    return `
      <div class="bw-item" data-id="${esc(p.id)}">
        <img class="bw-item-img" src="${esc(p.image)}" alt="">
        <div class="bw-item-body">
          <div class="bw-item-top">
            <div class="bw-item-title">${esc(p.title)}</div>
            ${priceHTML}
          </div>
          <div class="bw-item-controls">
            ${optsHTML}
            <div class="bw-qty">
              <button data-act="qty-dec" data-id="${esc(p.id)}" aria-label="Less">−</button>
              <span>${p.quantity || 1}</span>
              <button data-act="qty-inc" data-id="${esc(p.id)}" aria-label="More">+</button>
            </div>
          </div>
        </div>
        <button class="bw-remove" data-act="remove" data-id="${esc(p.id)}" title="Remove">&times;</button>
      </div>`;
  };

  BundleWidget.prototype._bind = function () {
    const self = this;
    this.root.querySelectorAll('[data-act]').forEach((el) => {
      const act = el.getAttribute('data-act');
      if (act === 'expand') el.addEventListener('click', (e) => { if (!e.target.closest('[data-act="dismiss"]')) self.expand(); });
      if (act === 'collapse') el.addEventListener('click', () => self.collapse());
      if (act === 'dismiss') el.addEventListener('click', (e) => { e.stopPropagation(); self.dismiss(); });
      if (act === 'remove') el.addEventListener('click', () => self.removeProduct(el.getAttribute('data-id')));
      if (act === 'qty-inc') el.addEventListener('click', () => self.changeQty(el.getAttribute('data-id'), 1));
      if (act === 'qty-dec') el.addEventListener('click', () => self.changeQty(el.getAttribute('data-id'), -1));
      if (act === 'checkout') el.addEventListener('click', () => self.checkout(el));
    });
    this.root.querySelectorAll('.bw-select').forEach((sel) => {
      sel.addEventListener('change', () => self.selectOption(sel.getAttribute('data-id'), parseInt(sel.getAttribute('data-opt'), 10), sel.value));
    });
  };

  BundleWidget.prototype.expand = function () { this.expanded = true; this._animateNext = true; this.render(); };
  BundleWidget.prototype.collapse = function () { this.expanded = false; this._animateNext = true; this.render(); };
  BundleWidget.prototype.dismiss = function () {
    this.session.dismissed = true; saveSession(this.session); this.destroy();
  };
  BundleWidget.prototype.destroy = function () {
    if (this.root) { this.root.remove(); this.root = null; }
  };

  BundleWidget.prototype.changeQty = function (id, delta) {
    const p = this.session.products.find((x) => String(x.id) === String(id));
    if (!p) return;
    p.quantity = Math.max(1, (p.quantity || 1) + delta);
    saveSession(this.session);
    this.render();
  };

  BundleWidget.prototype.selectOption = function (id, optIdx, value) {
    const p = this.session.products.find((x) => String(x.id) === String(id));
    if (!p) return;
    const chosen = p.options.map((o, i) => (i === optIdx ? value : (currentVariant(p).optionValues || [])[i] || o.values[0]));
    const match = (p.variants || []).find((vr) => (vr.optionValues || []).every((ov, i) => ov === chosen[i]));
    if (match) p.selectedVariantId = match.id;
    saveSession(this.session);
    this.render();
  };

  BundleWidget.prototype.checkout = function (btn) {
    const self = this;
    const items = this.selectedItems();
    const calc = computeDiscount(items, this.settings);
    if (!calc.eligible) return;

    if (btn) { btn.disabled = true; btn.textContent = 'Building your bundle…'; }

    if (this.preview) { this._showSuccess('PREVIEW-CODE', calc); return; }

    if (this.demo) {
      // No network in demo — simulate the success state.
      setTimeout(() => self._showSuccess('BUNDLE-DEMO12-X', calc), 700);
      return;
    }

    this._generateCode(items)
      .then((res) => {
        return self._addToCart(items).then(() => res);
      })
      .then((res) => {
        self._emit('add_to_cart', res.code);
        self._showSuccess(res.code, calc, res);
      })
      .catch((err) => {
        console.error('[bundle-widget] checkout failed', err);
        if (btn) { btn.disabled = false; btn.textContent = self.settings.ctaText; }
        alert('Sorry — we could not build your bundle. Please try again.');
      });
  };

  BundleWidget.prototype._showSuccess = function (code, calc, res) {
    const s = this.settings;
    const self = this;
    this.root.innerHTML = `
      <div class="bw-panel">
        <button class="bw-success-close" data-act="close" title="${esc(t(s.locale, 'keepShopping'))}">&times;</button>
        <div class="bw-success">
          <div class="bw-check"><svg viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
          <h3>${esc(t(s.locale, 'addedTitle'))}</h3>
          <p>${esc(t(s.locale, 'addedBody', { x: money(calc.discountAmount, s) }))}</p>
          <div class="bw-code">${esc(code)}</div>
          <button class="bw-cta" data-act="go-cart">${esc(t(s.locale, 'viewCart'))}</button>
          <button class="bw-success-continue" data-act="close">${esc(t(s.locale, 'keepShopping'))}</button>
        </div>
      </div>`;
    const go = this.root.querySelector('[data-act="go-cart"]');
    if (go) go.addEventListener('click', () => self._goToCartWithDiscount(code));
    this.root.querySelectorAll('[data-act="close"]').forEach((el) =>
      el.addEventListener('click', () => { self.expanded = false; self._animateNext = true; self.render(); })
    );
    if (!this.demo && !this.preview && this.settings.redirectToCart) {
      setTimeout(() => self._goToCartWithDiscount(code), 900);
    }
  };

  BundleWidget.prototype._goToCartWithDiscount = function (code) {
    if (this.demo || this.preview) { this.collapse(); return; }
    // Applying via /discount/<code> sets the cart cookie so it persists to checkout.
    window.location.href = `/discount/${encodeURIComponent(code)}?redirect=/cart`;
  };

  // ── Network (live mode) ─────────────────────────────────────
  BundleWidget.prototype._generateCode = function (items) {
    return fetch(`${APP_URL}/api/discount/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        shop: this.shop,
        sessionId: this.session.sessionId,
        items: items.map((it) => ({
          productId: it.productId,
          variantId: it.variantId,
          price: it.price / 100,
          quantity: it.quantity,
        })),
      }),
    }).then((r) => r.json().then((j) => { if (!r.ok) throw new Error(j.error || 'failed'); return j; }));
  };

  BundleWidget.prototype._addToCart = function (items) {
    return fetch('/cart/add.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: items.map((it) => ({ id: Number(it.variantId), quantity: it.quantity || 1 })),
      }),
    }).then((r) => { if (!r.ok) throw new Error('cart add failed'); return r.json(); });
  };

  BundleWidget.prototype._emitShown = function () { this._emit('widget_shown'); };
  BundleWidget.prototype._emit = function (eventType, code) {
    if (this.demo || this.preview) return;
    try {
      fetch(`${APP_URL}/api/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        keepalive: true,
        body: JSON.stringify({
          shop: this.shop,
          sessionId: this.session.sessionId,
          eventType,
          productIds: this.session.products.map((p) => p.id),
          productCount: this.session.products.length,
          discountCode: code,
        }),
      });
    } catch (e) {}
  };

  /* ======================================================================== */
  /*  Helpers                                                                  */
  /* ======================================================================== */
  function currentVariant(p) {
    if (!p.variants || !p.variants.length) return null;
    return p.variants.find((v) => String(v.id) === String(p.selectedVariantId)) || p.variants[0];
  }
  function normalizeProduct(p) {
    const np = Object.assign({ quantity: 1 }, p);
    if (np.variants && np.variants.length && !np.selectedVariantId) {
      const firstAvail = np.variants.find((v) => v.available !== false) || np.variants[0];
      np.selectedVariantId = firstAvail.id;
    }
    return np;
  }
  function badgeLabel(s, calc) {
    const amount = s.savingsAs === 'percentage' || s.discountType === 'percentage'
      ? `${calc.percentOff}%`
      : money(calc.discountAmount, s);
    return (s.badgeText || 'Save {amount}').replace('{amount}', amount);
  }
  function esc(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  /* ======================================================================== */
  /*  LIVE storefront bootstrap                                                */
  /* ======================================================================== */
  function detectShop() {
    if (window.Shopify && window.Shopify.shop) return window.Shopify.shop;
    return window.location.hostname;
  }

  function isProductPage() {
    if (window.ShopifyAnalytics && window.ShopifyAnalytics.meta && window.ShopifyAnalytics.meta.page) {
      return window.ShopifyAnalytics.meta.page.pageType === 'product';
    }
    return /\/products\//.test(window.location.pathname);
  }

  // Fetch the full product JSON (with variants) from the storefront.
  function fetchCurrentProduct() {
    const path = window.location.pathname.replace(/\/$/, '');
    const url = path.split('?')[0] + '.js';
    return fetch(url).then((r) => (r.ok ? r.json() : null)).then((prod) => {
      if (!prod) return null;
      return {
        id: prod.id,
        handle: prod.handle,
        title: prod.title,
        url: '/products/' + prod.handle,
        image: (prod.featured_image || (prod.images && prod.images[0]) || '').replace(/^\/\//, 'https://'),
        price: prod.price,
        compareAtPrice: prod.compare_at_price || null,
        options: (prod.options || []).map((name, i) => ({
          name: typeof name === 'string' ? name : name.name,
          values: typeof name === 'string'
            ? uniqueValues(prod.variants, i)
            : name.values,
        })),
        variants: (prod.variants || []).map((v) => ({
          id: v.id,
          title: v.title,
          price: v.price,
          compareAtPrice: v.compare_at_price || null,
          available: v.available,
          optionValues: [v.option1, v.option2, v.option3].filter((x) => x != null),
        })),
        selectedVariantId: (window.ShopifyAnalytics && window.ShopifyAnalytics.meta && window.ShopifyAnalytics.meta.selectedVariantId) || null,
      };
    }).catch(() => null);
  }
  function uniqueValues(variants, optIndex) {
    const key = 'option' + (optIndex + 1);
    return [...new Set((variants || []).map((v) => v[key]).filter((x) => x != null))];
  }

  function bootLive() {
    const shop = detectShop();
    const session = loadSession();

    // Reset session when we land on the order-status / thank-you page.
    if (/\/(thank_you|orders)\b/.test(window.location.pathname) ||
        (window.Shopify && window.Shopify.Checkout && window.Shopify.Checkout.step === 'thank_you')) {
      clearSession();
      return;
    }

    fetch(`${APP_URL}/api/settings/${shop}`)
      .then((r) => (r.ok ? r.json() : { settings: {} }))
      .then((data) => {
        const settings = data.settings || {};
        if (settings.enabled === false) return;
        const widget = new BundleWidget({ shop, settings, session });
        window.__bundleWidget = widget;

        const renderIfReady = () => {
          if (session.products.length >= (settings.triggerThreshold || 2)) widget.boot();
        };

        if (isProductPage()) {
          fetchCurrentProduct().then((product) => {
            if (product) widget.addProduct(product);
            renderIfReady();
          });
        } else {
          renderIfReady();
        }
      })
      .catch((e) => console.warn('[bundle-widget] settings load failed', e));
  }

  // ── Expose + auto-boot ──────────────────────────────────────
  window.BundleWidget = BundleWidget;
  window.BundleWidget.computeDiscount = computeDiscount;
  window.BundleWidget.injectStyles = injectStyles;
  window.BundleWidget.money = money;

  const cfg = window.BundleWidgetConfig || {};
  if (cfg.manual) {
    // Demo / preview drives boot itself.
  } else {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => setTimeout(bootLive, 0));
    } else {
      setTimeout(bootLive, 0);
    }
  }
})();
