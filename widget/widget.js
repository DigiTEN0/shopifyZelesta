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
    storeName: '',
    popup: {
      enabled: false,
      discount: 10,
      discountType: 'percentage',
      headline: '',
      subheadline: '',
      button: '',
      decline: '',
      image: '',
      collectName: true,
      delaySeconds: 6,
    },
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
    en: { bundled: '{n} products bundled', discountApplied: 'discount applied', original: 'Without the bundle', bundleSub: '{n} items together — {discount} off', change: 'change', bundlePrice: 'Bundle price', save: 'You save {x}', autoApplied: 'Discount applied automatically at checkout', addedTitle: 'Bundle added!', addedBody: 'Your {x} discount is locked in and applied at checkout.', viewCart: 'View cart & checkout', keepShopping: 'Continue shopping', emptyTitle: 'Your bundle is empty.', emptyBody: 'Browse a few products to build one.', popupHead: 'Want {discount} off your order?', popupSub: 'Sign up and get your discount code instantly.', popupYes: 'Yes, I want {discount} off', popupNo: 'No thanks', formTitle: 'Almost there — where do we send it?', formName: 'Name', formEmail: 'Email address', formSubmit: 'Get my discount', consent: 'You agree to receive marketing emails. Unsubscribe anytime.', codeTitle: "Here's your {discount} discount", codeSub: 'Applied automatically at checkout.', copyCode: 'Copy code', copied: 'Copied!', shopNow: 'Start shopping', alsoLike: 'Complete your bundle & save more' },
    nl: { bundled: '{n} producten gebundeld', discountApplied: 'korting toegepast', original: 'Zonder bundel', bundleSub: '{n} stuks samen — {discount} korting', change: 'wijzigen', bundlePrice: 'Bundelprijs', save: 'Je bespaart {x}', autoApplied: 'Korting wordt automatisch toegepast bij het afrekenen', addedTitle: 'Bundel toegevoegd!', addedBody: 'Je korting van {x} is vastgezet en wordt toegepast bij het afrekenen.', viewCart: 'Winkelwagen bekijken & afrekenen', keepShopping: 'Verder winkelen', emptyTitle: 'Je bundel is leeg.', emptyBody: 'Bekijk een paar producten om er een te maken.', popupHead: 'Wil jij {discount} korting op je bestelling?', popupSub: 'Schrijf je in en krijg direct jouw kortingscode.', popupYes: 'Ja, ik wil {discount} korting', popupNo: 'Nee bedankt', formTitle: 'Bijna klaar — waar sturen we het naartoe?', formName: 'Naam', formEmail: 'E-mailadres', formSubmit: 'Ontvang mijn korting', consent: 'Je gaat akkoord met het ontvangen van marketingmails. Je kunt je altijd uitschrijven.', codeTitle: 'Hier is je {discount} korting', codeSub: 'Wordt automatisch toegepast bij het afrekenen.', copyCode: 'Kopieer code', copied: 'Gekopieerd!', shopNow: 'Begin met winkelen', alsoLike: 'Maak je bundel compleet en bespaar meer' },
    de: { bundled: '{n} Produkte gebündelt', discountApplied: 'Rabatt angewendet', original: 'Ohne Bündel', bundleSub: '{n} Artikel zusammen — {discount} Rabatt', change: 'ändern', bundlePrice: 'Bündelpreis', save: 'Du sparst {x}', autoApplied: 'Rabatt wird automatisch an der Kasse angewendet', addedTitle: 'Bündel hinzugefügt!', addedBody: 'Dein Rabatt von {x} ist gesichert und wird an der Kasse angewendet.', viewCart: 'Warenkorb ansehen & zur Kasse', keepShopping: 'Weiter einkaufen', emptyTitle: 'Dein Bündel ist leer.', emptyBody: 'Sieh dir ein paar Produkte an, um eins zu erstellen.', popupHead: 'Möchtest du {discount} Rabatt auf deine Bestellung?', popupSub: 'Melde dich an und erhalte sofort deinen Rabattcode.', popupYes: 'Ja, ich will {discount} Rabatt', popupNo: 'Nein danke', formTitle: 'Fast geschafft — wohin sollen wir ihn senden?', formName: 'Name', formEmail: 'E-Mail-Adresse', formSubmit: 'Rabatt erhalten', consent: 'Du stimmst dem Erhalt von Marketing-E-Mails zu. Jederzeit abbestellbar.', codeTitle: 'Hier ist dein Rabatt von {discount}', codeSub: 'Wird an der Kasse automatisch angewendet.', copyCode: 'Code kopieren', copied: 'Kopiert!', shopNow: 'Jetzt einkaufen', alsoLike: 'Vervollständige dein Bündel und spare mehr' },
    fr: { bundled: '{n} produits regroupés', discountApplied: 'réduction appliquée', original: 'Sans le lot', bundleSub: '{n} articles ensemble — {discount} de réduction', change: 'modifier', bundlePrice: 'Prix du lot', save: 'Vous économisez {x}', autoApplied: 'Réduction appliquée automatiquement au paiement', addedTitle: 'Lot ajouté !', addedBody: 'Votre réduction de {x} est garantie et appliquée au paiement.', viewCart: 'Voir le panier et payer', keepShopping: 'Continuer mes achats', emptyTitle: 'Votre lot est vide.', emptyBody: 'Parcourez quelques produits pour en créer un.', popupHead: 'Voulez-vous {discount} de réduction sur votre commande ?', popupSub: 'Inscrivez-vous et recevez votre code de réduction instantanément.', popupYes: 'Oui, je veux {discount} de réduction', popupNo: 'Non merci', formTitle: 'Presque fini — où l\'envoyons-nous ?', formName: 'Nom', formEmail: 'Adresse e-mail', formSubmit: 'Obtenir ma réduction', consent: 'Vous acceptez de recevoir des e-mails marketing. Désabonnement à tout moment.', codeTitle: 'Voici votre réduction de {discount}', codeSub: 'Appliquée automatiquement au paiement.', copyCode: 'Copier le code', copied: 'Copié !', shopNow: 'Commencer mes achats', alsoLike: 'Complétez votre lot et économisez plus' },
    es: { bundled: '{n} productos agrupados', discountApplied: 'descuento aplicado', original: 'Sin el paquete', bundleSub: '{n} productos juntos — {discount} de descuento', change: 'cambiar', bundlePrice: 'Precio del paquete', save: 'Ahorras {x}', autoApplied: 'El descuento se aplica automáticamente al pagar', addedTitle: '¡Paquete añadido!', addedBody: 'Tu descuento de {x} está asegurado y se aplica al pagar.', viewCart: 'Ver carrito y pagar', keepShopping: 'Seguir comprando', emptyTitle: 'Tu paquete está vacío.', emptyBody: 'Explora algunos productos para crear uno.', popupHead: '¿Quieres {discount} de descuento en tu pedido?', popupSub: 'Regístrate y obtén tu código de descuento al instante.', popupYes: 'Sí, quiero {discount} de descuento', popupNo: 'No, gracias', formTitle: 'Casi listo, ¿a dónde lo enviamos?', formName: 'Nombre', formEmail: 'Correo electrónico', formSubmit: 'Obtener mi descuento', consent: 'Aceptas recibir correos de marketing. Cancela cuando quieras.', codeTitle: 'Aquí tienes tu descuento de {discount}', codeSub: 'Se aplica automáticamente al pagar.', copyCode: 'Copiar código', copied: '¡Copiado!', shopNow: 'Empezar a comprar', alsoLike: 'Completa tu paquete y ahorra más' },
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
.bw-head{position:relative;padding:20px 22px 12px;background:#fff;}
.bw-head-row{display:flex;align-items:center;justify-content:space-between;}
.bw-brand{font-size:11.5px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--bw-secondary);margin-bottom:5px;}
.bw-title{font-size:22px;font-weight:800;letter-spacing:-.02em;color:var(--bw-primary);line-height:1.08;}
.bw-sub{margin-top:6px;font-size:11px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:#a5a5aa;}
.bw-head-title{font-size:17px;font-weight:800;color:var(--bw-primary);display:flex;align-items:center;gap:9px;}
.bw-head-dot{width:8px;height:8px;border-radius:50%;background:var(--bw-secondary);box-shadow:0 0 0 4px rgba(17,24,39,.06);}
.bw-collapse{background:#f3f4f6;border:none;color:#6b7280;width:30px;height:30px;border-radius:9px;cursor:pointer;font-size:17px;line-height:1;transition:background .2s,color .2s;display:flex;align-items:center;justify-content:center;}
.bw-collapse:hover{background:#e5e7eb;color:#111827;}
.bw-head-light .bw-collapse{position:absolute;top:16px;right:16px;background:transparent;color:#c4c4c8;}
.bw-head-light .bw-collapse:hover{background:#f3f4f6;color:#111827;}

.bw-items{max-height:46vh;overflow-y:auto;padding:8px 8px 4px;}
.bw-item{display:flex;gap:12px;padding:12px;border-radius:14px;position:relative;transition:background .2s;}
.bw-item:hover{background:#f9fafb;}
.bw-item+.bw-item{border-top:1px solid #f1f2f4;}
.bw-item-img{width:56px;height:56px;border-radius:12px;object-fit:cover;background:#f1f1f2;flex:0 0 auto;}
.bw-item-body{flex:1;min-width:0;}
.bw-item-top{display:flex;align-items:baseline;justify-content:space-between;gap:10px;margin:1px 0 4px 0;}
.bw-item-title{font-size:14px;font-weight:650;line-height:1.3;color:#111827;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}
.bw-item-price{font-size:14px;font-weight:700;color:var(--bw-primary);white-space:nowrap;flex:0 0 auto;}
.bw-item-compare{font-size:11.5px;color:#9ca3af;text-decoration:line-through;margin-left:5px;font-weight:500;}
.bw-item-meta{font-size:12.5px;color:#8a8a8f;line-height:1.4;}
.bw-item-meta-txt{color:#8a8a8f;}
.bw-change{color:var(--bw-secondary);font-weight:600;cursor:pointer;text-decoration:underline;text-underline-offset:2px;}
.bw-remove-txt{border:none;background:transparent;color:#c4c4c8;cursor:pointer;font-size:16px;line-height:1;padding:0 2px;transition:color .15s;margin-left:2px;}
.bw-remove-txt:hover{color:#dc2626;}
.bw-item-controls{display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin-top:9px;}
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
.bw-savings{align-self:flex-start;margin-top:3px;color:var(--bw-secondary);font-size:13px;font-weight:700;}
.bw-cta{width:100%;border:none;border-radius:12px;background:var(--bw-secondary);color:#fff;font-size:13.5px;font-weight:800;
  padding:16px;cursor:pointer;text-transform:uppercase;letter-spacing:.06em;transition:transform .15s ease,filter .2s ease;}
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

/* ── Lead-capture pop-up (centered modal) ── */
.bw-modal-root{position:fixed;inset:0;z-index:2147483001;display:flex;align-items:center;justify-content:center;padding:20px;}
.bw-backdrop{position:absolute;inset:0;background:rgba(17,17,20,.55);backdrop-filter:saturate(120%) blur(2px);animation:bw-fade-in .25s ease both;}
.bw-modal{position:relative;display:flex;width:760px;max-width:100%;max-height:calc(100vh - 40px);background:#fff;border-radius:20px;overflow:hidden;
  box-shadow:0 40px 90px -30px rgba(17,17,20,.55);animation:bw-modal-in .4s cubic-bezier(.16,1,.3,1) both;}
.bw-modal-img{width:44%;flex:0 0 44%;background:#f1f1f2 center/cover no-repeat;min-height:340px;}
.bw-modal-body{flex:1;padding:40px 38px;display:flex;flex-direction:column;justify-content:center;position:relative;}
.bw-modal-x{position:absolute;top:16px;right:18px;width:34px;height:34px;border:none;background:transparent;color:#9aa0a6;font-size:24px;line-height:1;cursor:pointer;border-radius:8px;transition:background .15s,color .15s;}
.bw-modal-x:hover{background:#f3f4f6;color:#111827;}
.bw-modal h2{margin:0 0 12px;font-size:30px;line-height:1.1;font-weight:800;letter-spacing:-.02em;color:var(--bw-primary);}
.bw-modal h2 .bw-hl{color:var(--bw-secondary);}
.bw-modal p.bw-modal-sub{margin:0 0 24px;font-size:15px;color:#6b7280;line-height:1.5;}
.bw-modal-btn{width:100%;border:none;border-radius:12px;background:var(--bw-secondary);color:#fff;font-size:16px;font-weight:750;padding:16px;cursor:pointer;letter-spacing:-.01em;transition:transform .15s ease,filter .2s;}
.bw-modal-btn:hover{transform:translateY(-1px);filter:brightness(1.05);}
.bw-modal-btn:disabled{opacity:.6;cursor:default;transform:none;}
.bw-modal-decline{display:block;width:100%;margin-top:14px;background:none;border:none;color:#9aa0a6;font-size:13.5px;font-weight:600;cursor:pointer;text-align:center;}
.bw-modal-decline:hover{color:#6b7280;}
.bw-field{width:100%;border:1px solid #e2e4e8;border-radius:11px;padding:14px 15px;font-size:15px;color:#111827;margin-bottom:11px;outline:none;transition:border-color .15s,box-shadow .15s;background:#fbfbfc;}
.bw-field:focus{border-color:var(--bw-secondary);box-shadow:0 0 0 3px rgba(0,0,0,.05);background:#fff;}
.bw-field.bw-err{border-color:#dc2626;box-shadow:0 0 0 3px rgba(220,38,38,.1);}
.bw-consent{margin-top:12px;font-size:11.5px;color:#9aa0a6;line-height:1.4;text-align:center;}
.bw-label{display:block;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#9aa0a6;margin:4px 0 6px;}
.bw-modal .bw-modal-body > .bw-brand{margin-bottom:10px;}
.bw-code-card{padding:40px 32px 30px;text-align:center;}
.bw-code-big{display:block;font-family:ui-monospace,Menlo,monospace;font-size:19px;font-weight:800;letter-spacing:.04em;color:var(--bw-primary);background:#f6f6f7;border:1px dashed #cfd2d6;border-radius:12px;padding:16px;margin:6px 0 8px;}
.bw-copy{width:100%;border:none;border-radius:12px;background:var(--bw-primary);color:#fff;font-weight:700;font-size:14.5px;padding:14px;cursor:pointer;margin-top:6px;}
.bw-shop{display:block;width:100%;margin-top:10px;background:none;border:none;color:#9aa0a6;font-weight:600;font-size:13px;cursor:pointer;}
.bw-reco{padding:2px 20px 14px;}
.bw-reco-title{font-size:11px;font-weight:700;color:#9aa0a6;margin:0 0 10px;text-transform:uppercase;letter-spacing:.08em;}
.bw-reco-row{display:flex;gap:10px;overflow-x:auto;padding-bottom:4px;}
.bw-reco-card{flex:0 0 96px;width:96px;cursor:pointer;text-decoration:none;color:inherit;}
.bw-reco-imgwrap{position:relative;}
.bw-reco-card img{width:96px;height:96px;object-fit:cover;border-radius:12px;background:#f1f1f2;display:block;}
.bw-reco-add{position:absolute;bottom:6px;right:6px;width:24px;height:24px;border-radius:50%;background:#fff;color:var(--bw-primary);font-size:17px;font-weight:700;line-height:22px;text-align:center;box-shadow:0 3px 8px -2px rgba(17,24,39,.35);transition:transform .15s;}
.bw-reco-card:hover .bw-reco-add{transform:scale(1.12);background:var(--bw-secondary);color:#fff;}
.bw-reco-card .bw-reco-name{font-size:11.5px;font-weight:600;margin-top:6px;line-height:1.25;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}
.bw-reco-card .bw-reco-price{font-size:11.5px;font-weight:700;color:var(--bw-primary);}
.bw-items + .bw-reco{border-top:1px solid #f1f2f4;padding-top:12px;margin-top:2px;}
@keyframes bw-modal-in{0%{opacity:0;transform:translateY(18px) scale(.97);}100%{opacity:1;transform:translateY(0) scale(1);}}
@media(max-width:640px){
  .bw-modal{flex-direction:column;width:100%;max-height:calc(100vh - 24px);}
  .bw-modal-img{display:none;}
  .bw-modal-body{padding:34px 24px 28px;}
  .bw-modal h2{font-size:25px;}
}

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
    this._editing = new Set(); // product ids whose variant/qty controls are open
  }

  BundleWidget.prototype.boot = function () {
    injectStyles();
    this.render();
  };

  BundleWidget.prototype.applySettings = function (settings) {
    this.settings = Object.assign({}, DEFAULTS, settings || {});
    this.settings.popup = Object.assign({}, DEFAULTS.popup, (settings && settings.popup) || {});
    if (this.modal) this._renderModal();
    else this.render();
  };

  /* ── Lead-capture pop-up ───────────────────────────────────── */
  BundleWidget.prototype.popupDiscountLabel = function () {
    const p = this.settings.popup;
    if ((p.discountType || 'percentage') === 'percentage') return `${p.discount}%`;
    return money(Math.round(Number(p.discount) * 100), this.settings);
  };

  BundleWidget.prototype.maybeShowPopup = function () {
    const p = this.settings.popup;
    if (!p || !p.enabled) return false;
    if (this.session.captured || this.session.popupDismissed) return false;
    const self = this;
    clearTimeout(this._popupTimer);
    this._popupTimer = setTimeout(function () {
      if (!self.session.captured && !self.session.popupDismissed) self.showPopup('offer');
    }, Math.max(0, Number(p.delaySeconds) || 0) * 1000);
    return true;
  };

  BundleWidget.prototype.showPopup = function (stage) {
    this.popupStage = stage || 'offer';
    this._renderModal();
    if (!this.demo && !this.preview && this.popupStage === 'offer') this._emit('widget_shown');
  };

  BundleWidget.prototype._renderModal = function () {
    injectStyles();
    const s = this.settings;
    if (!this.modal) { this.modal = document.createElement('div'); document.body.appendChild(this.modal); }
    this.modal.className = 'bw-root bw-modal-root';
    this.modal.style.setProperty('--bw-primary', s.primaryColor);
    this.modal.style.setProperty('--bw-secondary', s.secondaryColor);
    if (s.fontFamily && s.fontFamily !== 'inherit') this.modal.style.setProperty('--bw-font', s.fontFamily);
    else this.modal.style.removeProperty('--bw-font');
    let inner;
    if (this.popupStage === 'form') inner = this._formHTML();
    else if (this.popupStage === 'code') inner = this._codeCardHTML();
    else inner = this._offerHTML();
    this.modal.innerHTML = `<div class="bw-backdrop" data-act="mclose"></div>${inner}`;
    this._bindModal();
  };

  BundleWidget.prototype._offerHTML = function () {
    const s = this.settings, p = s.popup, loc = s.locale, dl = this.popupDiscountLabel();
    const headline = p.headline || t(loc, 'popupHead', { discount: dl });
    const sub = p.subheadline || t(loc, 'popupSub');
    const yes = p.button || t(loc, 'popupYes', { discount: dl });
    const no = p.decline || t(loc, 'popupNo');
    const headHtml = esc(headline).split(esc(dl)).join(`<span class="bw-hl">${esc(dl)}</span>`);
    const img = p.image ? `<div class="bw-modal-img" style="background-image:url('${esc(p.image)}')"></div>` : '';
    const brand = s.storeName ? `<div class="bw-brand">${esc(s.storeName)}</div>` : '';
    return `<div class="bw-modal">${img}<div class="bw-modal-body">
      <button class="bw-modal-x" data-act="mclose" aria-label="Close">&times;</button>
      ${brand}
      <h2>${headHtml}</h2>
      <p class="bw-modal-sub">${esc(sub)}</p>
      <button class="bw-modal-btn" data-act="offer-yes">${esc(yes)}</button>
      <button class="bw-modal-decline" data-act="mclose">${esc(no)}</button>
    </div></div>`;
  };

  BundleWidget.prototype._formHTML = function () {
    const s = this.settings, p = s.popup, loc = s.locale;
    const img = p.image ? `<div class="bw-modal-img" style="background-image:url('${esc(p.image)}')"></div>` : '';
    const brand = s.storeName ? `<div class="bw-brand">${esc(s.storeName)}</div>` : '';
    return `<div class="bw-modal">${img}<div class="bw-modal-body">
      <button class="bw-modal-x" data-act="mclose" aria-label="Close">&times;</button>
      ${brand}
      <h2>${esc(t(loc, 'formTitle'))}</h2>
      <p class="bw-modal-sub">${esc(t(loc, 'popupSub'))}</p>
      ${p.collectName ? `<label class="bw-label">${esc(t(loc, 'formName'))}</label><input class="bw-field" data-field="name" type="text" placeholder="${esc(t(loc, 'formName'))}" autocomplete="name">` : ''}
      <label class="bw-label">${esc(t(loc, 'formEmail'))}</label>
      <input class="bw-field" data-field="email" type="email" placeholder="${esc(t(loc, 'formEmail'))}" autocomplete="email">
      <button class="bw-modal-btn" data-act="lead-submit">${esc(t(loc, 'formSubmit'))}</button>
      <div class="bw-consent">${esc(t(loc, 'consent'))}</div>
    </div></div>`;
  };

  BundleWidget.prototype._codeCardHTML = function () {
    const s = this.settings, loc = s.locale, dl = this.popupDiscountLabel();
    const code = this.session.code || '';
    const brand = s.storeName ? `<div class="bw-brand" style="text-align:center">${esc(s.storeName)}</div>` : '';
    return `<div class="bw-modal" style="max-width:430px;width:430px;"><div class="bw-modal-body" style="padding:34px 34px 26px;text-align:center;">
      <button class="bw-modal-x" data-act="mclose" aria-label="Close">&times;</button>
      ${brand}
      <div class="bw-check" style="margin:6px auto 16px"><svg viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
      <h2 style="font-size:24px">${esc(t(loc, 'codeTitle', { discount: dl }))}</h2>
      <p class="bw-modal-sub" style="margin-bottom:14px">${esc(t(loc, 'codeSub'))}</p>
      <span class="bw-code-big">${esc(code)}</span>
      <button class="bw-copy" data-act="copy-code">${esc(t(loc, 'copyCode'))}</button>
      <button class="bw-shop" data-act="mclose">${esc(t(loc, 'shopNow'))}</button>
      <div class="bw-reco" data-reco style="margin-top:14px"></div>
    </div></div>`;
  };

  BundleWidget.prototype._bindModal = function () {
    const self = this;
    this.modal.querySelectorAll('[data-act]').forEach(function (el) {
      const a = el.getAttribute('data-act');
      if (a === 'mclose') el.addEventListener('click', function () { self.dismissPopup(); });
      if (a === 'offer-yes') el.addEventListener('click', function () { self.popupStage = 'form'; self._renderModal(); });
      if (a === 'lead-submit') el.addEventListener('click', function () { self.submitLead(el); });
      if (a === 'copy-code') el.addEventListener('click', function () { self._copyCode(el); });
    });
    const email = this.modal.querySelector('[data-field="email"]');
    if (email) {
      setTimeout(function () { email.focus(); }, 60);
      email.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { const b = self.modal.querySelector('[data-act="lead-submit"]'); if (b) b.click(); }
      });
    }
  };

  BundleWidget.prototype.dismissPopup = function () {
    if (!this.session.captured) { this.session.popupDismissed = true; saveSession(this.session); }
    this.closeModal();
    if (this.session.captured && this.session.mode === 'bundle') { this.expanded = false; this._animateNext = true; this.render(); }
  };

  BundleWidget.prototype.closeModal = function () {
    clearTimeout(this._popupTimer);
    if (this.modal) { this.modal.remove(); this.modal = null; }
  };

  BundleWidget.prototype.submitLead = function (btn) {
    const self = this, loc = this.settings.locale;
    const emailEl = this.modal.querySelector('[data-field="email"]');
    const nameEl = this.modal.querySelector('[data-field="name"]');
    const email = ((emailEl && emailEl.value) || '').trim();
    const name = ((nameEl && nameEl.value) || '').trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { if (emailEl) { emailEl.classList.add('bw-err'); emailEl.focus(); } return; }
    if (btn) { btn.disabled = true; btn.textContent = '…'; }
    const items = this.selectedItems();

    if (this.demo || this.preview) {
      const mode = items.length >= 2 ? 'bundle' : (items.length === 1 ? 'single' : 'welcome');
      setTimeout(function () { self._afterCapture({ code: 'BUNDLE-DEMO12-X', mode: mode }); }, 500);
      return;
    }

    fetch(`${APP_URL}/api/lead`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        shop: this.shop, email: email, name: name, sessionId: this.session.sessionId,
        items: items.map(function (it) { return { productId: it.productId, variantId: it.variantId, price: it.price / 100, quantity: it.quantity, title: it.title, image: it.image, url: it.url }; }),
      }),
    }).then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || 'failed'); return j; }); })
      .then(function (res) { self._afterCapture(res); })
      .catch(function (err) {
        console.error('[bundle-widget] lead failed', err);
        if (btn) { btn.disabled = false; btn.textContent = t(loc, 'formSubmit'); }
        alert('Sorry, something went wrong. Please try again.');
      });
  };

  BundleWidget.prototype._afterCapture = function (res) {
    this.session.captured = true;
    this.session.code = res.code;
    this.session.mode = res.mode;
    saveSession(this.session);
    if (res.mode === 'bundle') {
      this.closeModal();
      this.expanded = true; this._animateNext = true; this.render();
    } else {
      this.popupStage = 'code';
      this._renderModal();
      if (res.mode === 'single') this._loadComplementary();
    }
  };

  BundleWidget.prototype._copyCode = function (btn) {
    const loc = this.settings.locale;
    try { navigator.clipboard.writeText(this.session.code || ''); } catch (e) {}
    if (btn) { const orig = btn.textContent; btn.textContent = t(loc, 'copied'); setTimeout(function () { btn.textContent = orig; }, 1500); }
  };

  BundleWidget.prototype._loadComplementary = function () {
    const self = this;
    if (this.demo || this.preview) return;
    const first = this.session.products[0];
    const container = this.modal && this.modal.querySelector('[data-reco]');
    if (!first || !container) return;
    fetch(`/recommendations/products.json?product_id=${encodeURIComponent(first.id)}&limit=4&intent=complementary`)
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        const products = (data && data.products) || [];
        if (!products.length) return;
        const s = self.settings, loc = s.locale;
        container.innerHTML = `<div class="bw-reco-title">${esc(t(loc, 'alsoLike'))}</div><div class="bw-reco-row">` +
          products.map(function (pr) {
            const img = (pr.featured_image || (pr.images && pr.images[0]) || '').replace(/^\/\//, 'https://');
            return `<a class="bw-reco-card" href="/products/${esc(pr.handle)}"><img src="${esc(img)}" alt=""><div class="bw-reco-name">${esc(pr.title)}</div><div class="bw-reco-price">${money(pr.price, s)}</div></a>`;
          }).join('') + `</div>`;
      }).catch(function () {});
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
        url: p.url || (p.handle ? '/products/' + p.handle : ''),
      };
    });
  };

  BundleWidget.prototype.render = function (animateAdd) {
    const s = this.settings;
    if (!s.enabled && !this.preview) { this.destroy(); return; }

    // When the lead pop-up is active and the visitor hasn't opted in yet, the
    // pop-up owns the flow — keep the corner pill/panel hidden until capture.
    if (s.popup && s.popup.enabled && !this.session.captured && !this.preview) { this.destroy(); return; }

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

    const dl = calc.eligible ? `${calc.percentOff}%` : '';
    const sub = t(s.locale, 'bundleSub', { n: this.session.products.length, discount: dl });
    const cta = esc(s.ctaText).split('{savings}').join(esc(savings));
    // Complementary picks only when there's still room in the bundle (<= 3 items).
    const showReco = this.session.products.length <= 3;

    return `
      <div class="bw-panel${anim}">
        <div class="bw-head bw-head-light">
          <button class="bw-collapse" data-act="collapse" title="Minimise">&times;</button>
          ${s.storeName ? `<div class="bw-brand">${esc(s.storeName)}</div>` : ''}
          <div class="bw-title">${esc(s.headerText)}</div>
          <div class="bw-sub">${esc(sub)}</div>
        </div>
        <div class="bw-items">${rows}</div>
        ${showReco ? '<div class="bw-reco" data-reco></div>' : ''}
        <div class="bw-foot">
          <div class="bw-totals">
            ${s.showPrices ? `<div class="bw-row"><span>${esc(t(s.locale, 'original'))}</span><span class="bw-strike">${money(calc.subtotal, s)}</span></div>` : ''}
            <div class="bw-row bw-total-row"><span class="bw-total-label">${esc(t(s.locale, 'bundlePrice'))}</span><span class="bw-total-val">${money(calc.total, s)}</span></div>
            ${calc.eligible ? `<span class="bw-savings">${esc(t(s.locale, 'save', { x: savings }))}</span>` : ''}
          </div>
          <button class="bw-cta" data-act="checkout" ${calc.eligible ? '' : 'disabled'}>${cta}</button>
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

    // Selected variant shown as clean text; "wijzigen" reveals the controls.
    const editing = this._editing && this._editing.has(String(p.id));
    const variantText = (hasOptions && v && v.optionValues && v.optionValues.length) ? v.optionValues.join(', ') : '';
    const metaBits = [variantText, (p.quantity || 1) > 1 ? `${p.quantity}×` : ''].filter(Boolean).join(' · ');
    const metaLine = `${metaBits ? `<span class="bw-item-meta-txt">${esc(metaBits)}</span> · ` : ''}<a class="bw-change" data-act="edit" data-id="${esc(p.id)}">${esc(t(s.locale, 'change'))}</a>`;

    const controls = editing ? `
      <div class="bw-item-controls">
        ${optsHTML}
        <div class="bw-qty">
          <button data-act="qty-dec" data-id="${esc(p.id)}" aria-label="Less">−</button>
          <span>${p.quantity || 1}</span>
          <button data-act="qty-inc" data-id="${esc(p.id)}" aria-label="More">+</button>
        </div>
        <button class="bw-remove-txt" data-act="remove" data-id="${esc(p.id)}" title="Remove">&times;</button>
      </div>` : '';

    return `
      <div class="bw-item" data-id="${esc(p.id)}">
        <img class="bw-item-img" src="${esc(p.image)}" alt="">
        <div class="bw-item-body">
          <div class="bw-item-top">
            <div class="bw-item-title">${esc(p.title)}</div>
            ${priceHTML}
          </div>
          <div class="bw-item-meta">${metaLine}</div>
          ${controls}
        </div>
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
      if (act === 'edit') el.addEventListener('click', () => self.toggleEdit(el.getAttribute('data-id')));
      if (act === 'add-reco') el.addEventListener('click', (e) => { e.preventDefault(); self.addRecommended(el); });
      if (act === 'checkout') el.addEventListener('click', () => self.checkout(el));
    });
    this.root.querySelectorAll('.bw-select').forEach((sel) => {
      sel.addEventListener('change', () => self.selectOption(sel.getAttribute('data-id'), parseInt(sel.getAttribute('data-opt'), 10), sel.value));
    });
    // Complementary picks (only when the bundle still has room).
    if (this.expanded && this.session.products.length <= 3) this._loadPanelReco();
  };

  BundleWidget.prototype.toggleEdit = function (id) {
    const key = String(id);
    if (this._editing.has(key)) this._editing.delete(key);
    else this._editing.add(key);
    this.render();
  };

  // Fetch "similar products" from Shopify and offer them as one-tap additions.
  BundleWidget.prototype._loadPanelReco = function () {
    const self = this;
    if (this.demo || this.preview) return;
    const container = this.root && this.root.querySelector('[data-reco]');
    const first = this.session.products[0];
    if (!container || !first || container.getAttribute('data-loaded')) return;
    container.setAttribute('data-loaded', '1');
    const have = new Set(this.session.products.map((p) => String(p.id)));
    fetch(`/recommendations/products.json?product_id=${encodeURIComponent(first.id)}&limit=6&intent=related`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const products = ((data && data.products) || []).filter((p) => !have.has(String(p.id))).slice(0, 4);
        if (!products.length) { container.innerHTML = ''; return; }
        const s = self.settings;
        container.innerHTML = `<div class="bw-reco-title">${esc(t(s.locale, 'alsoLike'))}</div><div class="bw-reco-row">` +
          products.map((pr) => {
            const img = (pr.featured_image || (pr.images && pr.images[0]) || '').replace(/^\/\//, 'https://');
            const data = encodeURIComponent(JSON.stringify(slimProduct(pr)));
            return `<div class="bw-reco-card" data-act="add-reco" data-p="${data}"><div class="bw-reco-imgwrap"><img src="${esc(img)}" alt=""><span class="bw-reco-add">+</span></div><div class="bw-reco-name">${esc(pr.title)}</div><div class="bw-reco-price">${money(pr.price, s)}</div></div>`;
          }).join('') + `</div>`;
        self._bind(); // rebind the new add-reco cards
      }).catch(() => { container.innerHTML = ''; });
  };

  BundleWidget.prototype.addRecommended = function (el) {
    try {
      const p = JSON.parse(decodeURIComponent(el.getAttribute('data-p')));
      if (!p || !p.id) return;
      if (this.session.products.some((x) => String(x.id) === String(p.id))) return;
      this.session.products.push(normalizeProduct(p));
      saveSession(this.session);
      this._animateNext = false;
      this.render();
    } catch (e) {}
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
  // Map a Shopify recommendations/product JSON to the widget's product shape.
  function slimProduct(prod) {
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
        values: typeof name === 'string' ? uniqueValues(prod.variants, i) : name.values,
      })),
      variants: (prod.variants || []).map((v) => ({
        id: v.id, title: v.title, price: v.price, compareAtPrice: v.compare_at_price || null,
        available: v.available, optionValues: [v.option1, v.option2, v.option3].filter((x) => x != null),
      })),
      selectedVariantId: null,
    };
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
        const popupOn = settings.popup && settings.popup.enabled;
        const threshold = settings.triggerThreshold || 2;

        const orchestrate = () => {
          if (widget.session.captured) {
            // Already opted in: show the bundle pill so they can reopen it.
            if (widget.session.mode === 'bundle' && widget.session.products.length >= threshold) {
              widget.expanded = false;
              widget.boot();
            }
            return;
          }
          // Pop-up only fires once the visitor has actually browsed something.
          if (popupOn && widget.session.products.length >= 1) {
            widget.maybeShowPopup(); // lead pop-up gates the bundle
          } else if (!popupOn && widget.session.products.length >= threshold) {
            widget.boot();
          }
        };

        if (isProductPage()) {
          fetchCurrentProduct().then((product) => {
            if (product) widget.addProduct(product);
            orchestrate();
          });
        } else {
          orchestrate();
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
