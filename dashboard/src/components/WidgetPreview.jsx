// Live preview of the actual storefront widget, rendered inside an iframe so it
// gets its own document/body (the widget mounts fixed-position elements). Reuses
// the real /widget/widget.js — what merchants configure is exactly what ships.
import React, { useEffect, useRef, useState } from 'react';
import { APP_URL, api } from '../lib/api.js';

// Fallback sample used only if the store has no products yet.
const FALLBACK_PRODUCTS = [
  { id: 'pv-1', title: 'Sample product A', price: 4900, compareAtPrice: 5900, quantity: 1,
    image: 'https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-product-1_large.png',
    options: [{ name: 'Size', values: ['S', 'M', 'L'] }], variants: [{ id: 'v1', price: 4900, available: true, optionValues: ['M'] }], selectedVariantId: 'v1' },
  { id: 'pv-2', title: 'Sample product B', price: 3500, compareAtPrice: 3900, quantity: 1,
    image: 'https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-product-2_large.png',
    options: [{ name: 'Colour', values: ['Black', 'Sand'] }], variants: [{ id: 'v2', price: 3500, available: true, optionValues: ['Black'] }], selectedVariantId: 'v2' },
  { id: 'pv-3', title: 'Sample product C', price: 2900, compareAtPrice: 3400, quantity: 1,
    image: 'https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-product-3_large.png',
    options: [], variants: [{ id: 'v3', price: 2900, available: true, optionValues: [] }], selectedVariantId: 'v3' },
];

export default function WidgetPreview({ settings, variant = 'bundle' }) {
  const iframeRef = useRef(null);
  const bootedRef = useRef(false);
  const [products, setProducts] = useState(FALLBACK_PRODUCTS);

  // Pull real products from the store so the preview shows their catalogue.
  useEffect(() => {
    let active = true;
    api.getPreviewProducts()
      .then((res) => {
        const real = (res.products || []).filter((p) => p.image);
        if (active && real.length) setProducts(real.map((p) => ({ ...p, quantity: 1 })));
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  // Pop-up flow ends on a single-product reveal (so the complementary carousel
  // shows). The bundle preview shows a full multi-product bundle (no carousel).
  const PREVIEW_PRODUCTS = variant === 'popup' ? products.slice(0, 1) : products.slice(0, 3);
  const RECO_PRODUCTS = variant === 'popup' ? products.slice(1, 7) : [];

  const srcDoc = `<!doctype html><html><head><meta charset="utf-8">
    <style>html,body{margin:0;height:100%;background:#f6f6f7;font-family:-apple-system,Segoe UI,Roboto,sans-serif;}
    .hint{position:absolute;top:14px;left:0;right:0;text-align:center;color:#9aa0a6;font-size:12px;letter-spacing:.02em;}
    .mock{position:absolute;inset:0;background:
      radial-gradient(120% 80% at 50% 0%, #ffffff 0%, #f1f1f3 100%);}
    .bar{height:46px;background:#fff;border-bottom:1px solid #ececec;display:flex;align-items:center;padding:0 18px;font-weight:700;letter-spacing:.14em;font-size:13px;color:#1c1917;}
    </style></head>
    <body>
      <div class="mock"></div>
      <div class="bar">ZELESTA</div>
      <div class="hint">Live preview — interact with the widget below</div>
      <script>window.BundleWidgetConfig={manual:true,appUrl:${JSON.stringify(APP_URL)}};</script>
      <script src="${APP_URL}/widget/widget.js"></script>
      <script>
        var PRODUCTS=${JSON.stringify(PREVIEW_PRODUCTS)};
        var RECO=${JSON.stringify(RECO_PRODUCTS)};
        var VARIANT=${JSON.stringify(variant)};
        function boot(settings){
          if(!window.BundleWidget){return setTimeout(function(){boot(settings)},40);}
          if(window.__pv){window.__pv.applySettings(settings);return;}
          window.__pv=new window.BundleWidget({shop:'preview',settings:settings,preview:true,startExpanded:(VARIANT!=='popup'),
            recoProducts:RECO,
            session:{sessionId:'pv',products:JSON.parse(JSON.stringify(PRODUCTS)),dismissed:false}});
          if(VARIANT==='popup'){ window.__pv.showPopup('offer'); } else { window.__pv.boot(); }
        }
        window.addEventListener('message',function(e){if(e.data&&e.data.type==='bw-settings'){boot(e.data.settings);}});
        boot(${JSON.stringify(settings)});
      </script>
    </body></html>`;

  // Push settings updates without reloading the iframe.
  useEffect(() => {
    if (!bootedRef.current) {
      bootedRef.current = true;
      return; // initial srcDoc already carries the settings
    }
    const win = iframeRef.current?.contentWindow;
    if (win) win.postMessage({ type: 'bw-settings', settings }, '*');
  }, [settings]);

  return (
    <iframe
      ref={iframeRef}
      title="Widget preview"
      srcDoc={srcDoc}
      style={{
        width: '100%',
        height: variant === 'popup' ? 620 : 580,
        border: '1px solid #E3E3E3',
        borderRadius: 12,
        background: '#f6f6f7',
      }}
    />
  );
}
