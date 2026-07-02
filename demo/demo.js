/* Demo driver — hardcoded bedding store, no Shopify connection.
   Renders the product grid and boots the real widget in demo mode, expanded. */
(function () {
  // Prices in cents (EUR).
  const PRODUCTS = [
    {
      id: 'demo-duvet',
      title: 'Cloud Cotton Duvet Cover',
      tag: 'Bedding',
      price: 12900,
      compareAtPrice: 14900,
      image: 'https://images.unsplash.com/photo-1584100936595-c0654b55a2e6?auto=format&fit=crop&w=700&q=80',
      options: [
        { name: 'Size', values: ['Single', 'Double', 'King'] },
        { name: 'Colour', values: ['Sand', 'Charcoal'] },
      ],
      variants: buildVariants('demo-duvet', [
        ['Single', 'Sand', 11900], ['Single', 'Charcoal', 11900],
        ['Double', 'Sand', 12900], ['Double', 'Charcoal', 12900],
        ['King', 'Sand', 14900], ['King', 'Charcoal', 14900],
      ]),
    },
    {
      id: 'demo-pillow',
      title: 'Sateen Pillowcase Set (2)',
      tag: 'Bedding',
      price: 3900,
      compareAtPrice: 4500,
      image: 'https://images.unsplash.com/photo-1592789705501-f9ae4287c4cf?auto=format&fit=crop&w=700&q=80',
      options: [{ name: 'Colour', values: ['Sand', 'Charcoal', 'White'] }],
      variants: buildVariants('demo-pillow', [
        ['Sand', 3900], ['Charcoal', 3900], ['White', 3900],
      ], 1),
    },
    {
      id: 'demo-sheet',
      title: 'Brushed Fitted Sheet',
      tag: 'Bedding',
      price: 5900,
      compareAtPrice: 6900,
      image: 'https://images.unsplash.com/photo-1616627561839-074385245ff6?auto=format&fit=crop&w=700&q=80',
      options: [{ name: 'Size', values: ['Single', 'Double', 'King'] }],
      variants: buildVariants('demo-sheet', [
        ['Single', 5500], ['Double', 5900], ['King', 6900],
      ], 1),
    },
  ];

  function buildVariants(prefix, rows, singleOpt) {
    return rows.map((r, i) => {
      if (singleOpt) {
        return { id: `${prefix}-v${i}`, title: r[0], price: r[1], available: true, optionValues: [r[0]] };
      }
      return { id: `${prefix}-v${i}`, title: `${r[0]} / ${r[1]}`, price: r[2], available: true, optionValues: [r[0], r[1]] };
    });
  }

  const DEMO_SETTINGS = {
    storeName: 'ZELESTA',
    triggerThreshold: 2,
    discountType: 'percentage',
    tiers: { 2: 10, 3: 15, 4: 20 },
    valueRules: [{ min_value: 250, type: 'percentage', amount: 22 }],
    maxDiscountCap: 40,
    minBundleValue: 0,
    primaryColor: '#1c1917',
    secondaryColor: '#b08968',
    position: 'bottom-right',
    headerText: 'Your Bundle',
    ctaText: 'Add All to Cart & Save',
    badgeText: 'Save {amount}',
    savingsAs: 'currency',
    showPrices: true,
    showCompareAt: true,
    currency: 'EUR',
    locale: 'en',
    enabled: true,
  };

  // Render the faux store grid.
  const grid = document.getElementById('product-grid');
  if (grid) {
    grid.innerHTML = PRODUCTS.map((p) => `
      <article class="card">
        <div class="card-img"><img src="${p.image}" alt="${p.title}" loading="lazy"></div>
        <div class="card-body">
          <div class="tag">${p.tag}</div>
          <h3>${p.title}</h3>
          <div class="price">€${(p.price / 100).toFixed(2)}</div>
        </div>
      </article>`).join('');
  }

  // Boot the widget in demo mode with all 3 products already "browsed", expanded.
  function start() {
    if (!window.BundleWidget) { setTimeout(start, 30); return; }
    const widget = new window.BundleWidget({
      shop: 'demo.myshopify.com',
      settings: DEMO_SETTINGS,
      demo: true,
      startExpanded: true,
      session: { sessionId: 'demo-session', products: JSON.parse(JSON.stringify(PRODUCTS)), dismissed: false },
    });
    widget.boot();
    window.__demoWidget = widget;
  }
  start();
})();
