import React, { useEffect, useState, useCallback } from 'react';
import {
  Page, Layout, Card, BlockStack, InlineStack, Text, TextField, Select,
  ButtonGroup, Button, Checkbox, Divider, SkeletonBodyText, Box,
} from '@shopify/polaris';
import { api } from '../lib/api.js';
import { useToast } from '../App.jsx';
import WidgetPreview from '../components/WidgetPreview.jsx';

const FONTS = [
  { label: 'Match store theme', value: 'inherit' },
  { label: 'Modern sans (system)', value: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" },
  { label: 'Elegant serif (Georgia)', value: "Georgia, 'Times New Roman', serif" },
  { label: 'Neutral (Helvetica)', value: "'Helvetica Neue', Arial, sans-serif" },
  { label: 'Editorial mono', value: "'Courier New', ui-monospace, monospace" },
];

const LOCALES = [
  { label: 'English', value: 'en' },
  { label: 'Nederlands', value: 'nl' },
  { label: 'Deutsch', value: 'de' },
  { label: 'Français', value: 'fr' },
  { label: 'Español', value: 'es' },
];

export default function WidgetCustomisationPage() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [s, setS] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.getSettings();
        setS(res.settings);
      } catch (e) {
        toast(e.message, true);
      } finally {
        setLoading(false);
      }
    })();
  }, [toast]);

  const set = useCallback((patch) => setS((prev) => ({ ...prev, ...patch })), []);

  const save = async () => {
    setSaving(true);
    try {
      const res = await api.saveSettings({
        primary_color: s.primary_color,
        secondary_color: s.secondary_color,
        position: s.position,
        header_text: s.header_text,
        cta_text: s.cta_text,
        badge_text: s.badge_text,
        font_family: s.font_family,
        locale: s.locale,
        show_prices: s.show_prices,
        show_compare_at: s.show_compare_at,
        savings_as: s.savings_as,
        redirect_to_cart: s.redirect_to_cart,
      });
      setS(res.settings);
      toast('Widget appearance saved');
    } catch (e) {
      toast(e.message, true);
    } finally {
      setSaving(false);
    }
  };

  if (loading || !s) {
    return <Page title="Widget Customisation"><Card><SkeletonBodyText lines={12} /></Card></Page>;
  }

  return (
    <Page
      title="Widget Customisation"
      subtitle="Design the widget your customers see. The preview updates as you type."
      primaryAction={{ content: 'Save', onAction: save, loading: saving }}
      secondaryActions={[{ content: 'Open full demo', onAction: () => window.open('/demo', '_blank') }]}
    >
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">Brand colours</Text>
                <InlineStack gap="400">
                  <ColorField label="Primary" value={s.primary_color} onChange={(v) => set({ primary_color: v })} />
                  <ColorField label="Accent / discount" value={s.secondary_color} onChange={(v) => set({ secondary_color: v })} />
                </InlineStack>
                <Divider />
                <Text as="h3" variant="headingSm">Position</Text>
                <ButtonGroup variant="segmented">
                  <Button pressed={s.position === 'bottom-left'} onClick={() => set({ position: 'bottom-left' })}>Bottom-left</Button>
                  <Button pressed={s.position === 'bottom-right'} onClick={() => set({ position: 'bottom-right' })}>Bottom-right</Button>
                </ButtonGroup>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">Copy</Text>
                <TextField label="Widget header text" value={s.header_text} onChange={(v) => set({ header_text: v })} autoComplete="off" />
                <TextField label="CTA button text" value={s.cta_text} onChange={(v) => set({ cta_text: v })} autoComplete="off" />
                <TextField
                  label="Discount badge text"
                  value={s.badge_text}
                  onChange={(v) => set({ badge_text: v })}
                  helpText="Use {amount} as a placeholder, e.g. “Save {amount}”."
                  autoComplete="off"
                />
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">Type &amp; language</Text>
                <Select label="Font" options={FONTS} value={s.font_family} onChange={(v) => set({ font_family: v })} />
                <Select label="Widget language" options={LOCALES} value={s.locale} onChange={(v) => set({ locale: v })} />
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">Display options</Text>
                <Checkbox label="Show product prices" checked={s.show_prices} onChange={(v) => set({ show_prices: v })} />
                <Checkbox label="Show original crossed-out price" checked={s.show_compare_at} onChange={(v) => set({ show_compare_at: v })} />
                <Box>
                  <Text as="p" variant="bodySm" tone="subdued">Show savings as</Text>
                  <Box paddingBlockStart="200">
                    <ButtonGroup variant="segmented">
                      <Button pressed={s.savings_as === 'currency'} onClick={() => set({ savings_as: 'currency' })}>Amount (€)</Button>
                      <Button pressed={s.savings_as === 'percentage'} onClick={() => set({ savings_as: 'percentage' })}>Percentage (%)</Button>
                    </ButtonGroup>
                  </Box>
                </Box>
                <Divider />
                <Checkbox
                  label="Redirect to cart after adding"
                  checked={s.redirect_to_cart}
                  onChange={(v) => set({ redirect_to_cart: v })}
                  helpText="Otherwise the shopper stays on the page and sees an in-widget success state."
                />
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>

        <Layout.Section variant="oneThird">
          <Box position="sticky" insetBlockStart="500">
            <Card>
              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="h2" variant="headingMd">Live preview</Text>
                  <Button variant="plain" onClick={() => window.open('/demo', '_blank')}>Demo mode ↗</Button>
                </InlineStack>
                <WidgetPreview settings={toPublic(s)} />
                <Text as="p" variant="bodySm" tone="subdued">
                  This is the real widget. Switch variants, change quantities and remove items just like your customers will.
                </Text>
              </BlockStack>
            </Card>
          </Box>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

function ColorField({ label, value, onChange }) {
  return (
    <BlockStack gap="100">
      <Text as="span" variant="bodySm">{label}</Text>
      <InlineStack gap="200" blockAlign="center">
        <input
          type="color"
          value={value || '#000000'}
          onChange={(e) => onChange(e.target.value)}
          style={{ width: 40, height: 40, border: '1px solid #E3E3E3', borderRadius: 8, padding: 2, cursor: 'pointer', background: '#fff' }}
        />
        <div style={{ width: 110 }}>
          <TextField label="" labelHidden value={value} onChange={onChange} autoComplete="off" />
        </div>
      </InlineStack>
    </BlockStack>
  );
}

// Map DB (snake_case) settings to the widget's public (camelCase) shape.
function toPublic(s) {
  return {
    triggerThreshold: s.trigger_threshold,
    discountType: s.discount_type,
    tiers: s.tiers,
    valueRules: s.value_rules,
    maxDiscountCap: Number(s.max_discount_cap),
    minBundleValue: Number(s.min_bundle_value),
    primaryColor: s.primary_color,
    secondaryColor: s.secondary_color,
    position: s.position,
    headerText: s.header_text,
    ctaText: s.cta_text,
    badgeText: s.badge_text,
    fontFamily: s.font_family,
    locale: s.locale,
    showPrices: s.show_prices,
    showCompareAt: s.show_compare_at,
    savingsAs: s.savings_as,
    redirectToCart: s.redirect_to_cart,
    currency: s.currency,
    enabled: true,
  };
}
