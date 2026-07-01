// Live preview of the actual storefront widget, rendered inside an iframe so it
// gets its own document/body (the widget mounts fixed-position elements). Reuses
// the real /widget/widget.js — what merchants configure is exactly what ships.
import React, { useEffect, useRef } from 'react';
import { APP_URL } from '../lib/api.js';

const PREVIEW_PRODUCTS = [
  {
    id: 'pv-duvet', title: 'Cloud Cotton Duvet Cover', price: 12900, compareAtPrice: 14900, quantity: 1,
    image: 'https://images.unsplash.com/photo-1584100936595-c0654b55a2e6?auto=format&fit=crop&w=400&q=80',
    options: [{ name: 'Size', values: ['Single', 'Double', 'King'] }, { name: 'Colour', values: ['Sand', 'Charcoal'] }],
    variants: [
      { id: 'pv-d1', price: 12900, available: true, optionValues: ['Double', 'Sand'] },
      { id: 'pv-d2', price: 14900, available: true, optionValues: ['King', 'Sand'] },
      { id: 'pv-d3', price: 12900, available: true, optionValues: ['Double', 'Charcoal'] },
    ],
    selectedVariantId: 'pv-d1',
  },
  {
    id: 'pv-pillow', title: 'Sateen Pillowcase Set (2)', price: 3900, compareAtPrice: 4500, quantity: 1,
    image: 'https://images.unsplash.com/photo-1592789705501-f9ae4287c4cf?auto=format&fit=crop&w=400&q=80',
    options: [{ name: 'Colour', values: ['Sand', 'Charcoal', 'White'] }],
    variants: [{ id: 'pv-p1', price: 3900, available: true, optionValues: ['Sand'] }],
    selectedVariantId: 'pv-p1',
  },
  {
    id: 'pv-sheet', title: 'Brushed Fitted Sheet', price: 5900, compareAtPrice: 6900, quantity: 1,
    image: 'https://images.unsplash.com/photo-1616627561839-074385245ff6?auto=format&fit=crop&w=400&q=80',
    options: [{ name: 'Size', values: ['Single', 'Double', 'King'] }],
    variants: [{ id: 'pv-s1', price: 5900, available: true, optionValues: ['Double'] }],
    selectedVariantId: 'pv-s1',
  },
];

export default function WidgetPreview({ settings, variant = 'bundle' }) {
  const iframeRef = useRef(null);
  const bootedRef = useRef(false);

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
        var VARIANT=${JSON.stringify(variant)};
        function boot(settings){
          if(!window.BundleWidget){return setTimeout(function(){boot(settings)},40);}
          if(window.__pv){window.__pv.applySettings(settings);return;}
          window.__pv=new window.BundleWidget({shop:'preview',settings:settings,preview:true,startExpanded:(VARIANT!=='popup'),
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
        height: variant === 'popup' ? 560 : 520,
        border: '1px solid #E3E3E3',
        borderRadius: 12,
        background: '#f6f6f7',
      }}
    />
  );
}
