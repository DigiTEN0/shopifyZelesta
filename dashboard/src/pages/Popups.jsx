import React, { useEffect, useState, useCallback } from 'react';
import {
  Page, Layout, Card, BlockStack, InlineStack, Text, Checkbox, TextField, Select,
  ButtonGroup, Button, RangeSlider, Divider, Box, Banner, SkeletonBodyText,
} from '@shopify/polaris';
import { api } from '../lib/api.js';
import { useToast } from '../App.jsx';
import WidgetPreview from '../components/WidgetPreview.jsx';

export default function PopupsPage({ goTo }) {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [s, setS] = useState(null);
  const [storeName, setStoreName] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await api.getSettings();
        setS(res.settings);
        setStoreName(res.meta?.storeName || '');
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
        popup_enabled: s.popup_enabled,
        popup_discount: Number(s.popup_discount),
        popup_discount_type: s.popup_discount_type,
        popup_headline: s.popup_headline,
        popup_subheadline: s.popup_subheadline,
        popup_button: s.popup_button,
        popup_decline: s.popup_decline,
        popup_image: s.popup_image,
        popup_collect_name: s.popup_collect_name,
        popup_delay_seconds: Number(s.popup_delay_seconds),
      });
      setS(res.settings);
      toast('Pop-up saved');
    } catch (e) {
      toast(e.message, true);
    } finally {
      setSaving(false);
    }
  };

  if (loading || !s) {
    return <Page title="Pop-up & Leads"><Card><SkeletonBodyText lines={12} /></Card></Page>;
  }

  return (
    <Page
      title="Pop-up & Leads"
      subtitle="Capture an email in exchange for a discount, then reveal the bundle. Every lead is tied to what the visitor browsed."
      primaryAction={{ content: 'Save', onAction: save, loading: saving }}
      secondaryActions={[{ content: 'See captured leads', onAction: () => goTo('leads') }]}
    >
      <Layout>
        <Layout.Section variant="oneHalf">
          <BlockStack gap="400">
            <Card>
              <BlockStack gap="300">
                <Checkbox
                  label="Enable the lead-capture pop-up"
                  checked={s.popup_enabled}
                  onChange={(v) => set({ popup_enabled: v })}
                  helpText="When on, a floating icon appears after a visitor views a product. Tapping it starts the email step, then reveals the bundle."
                />
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">The offer</Text>
                <InlineStack gap="300" blockAlign="end">
                  <div style={{ minWidth: 150 }}>
                    <TextField
                      label="Discount"
                      type="number"
                      value={String(s.popup_discount)}
                      onChange={(v) => set({ popup_discount: v })}
                      suffix={s.popup_discount_type === 'percentage' ? '%' : s.currency}
                      autoComplete="off"
                    />
                  </div>
                  <ButtonGroup variant="segmented">
                    <Button pressed={s.popup_discount_type === 'percentage'} onClick={() => set({ popup_discount_type: 'percentage' })}>%</Button>
                    <Button pressed={s.popup_discount_type === 'fixed'} onClick={() => set({ popup_discount_type: 'fixed' })}>{s.currency}</Button>
                  </ButtonGroup>
                </InlineStack>
                <Checkbox label="Also ask for the visitor's name" checked={s.popup_collect_name} onChange={(v) => set({ popup_collect_name: v })} />
                <TextField
                  label="Image URL (left side of the pop-up)"
                  value={s.popup_image}
                  onChange={(v) => set({ popup_image: v })}
                  placeholder="https://…/lifestyle.jpg"
                  helpText="Leave empty for a text-only pop-up."
                  autoComplete="off"
                />
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="h2" variant="headingMd">Copy</Text>
                </InlineStack>
                <Text as="p" tone="subdued" variant="bodySm">
                  Leave any field empty to use the built-in translation for the visitor's language.
                  Use <Text as="span" fontWeight="semibold">{'{discount}'}</Text> to insert the amount.
                </Text>
                <TextField label="Headline" value={s.popup_headline} onChange={(v) => set({ popup_headline: v })} placeholder="Want {discount} off your order?" autoComplete="off" />
                <TextField label="Subheadline" value={s.popup_subheadline} onChange={(v) => set({ popup_subheadline: v })} placeholder="Sign up and get your discount code instantly." autoComplete="off" />
                <TextField label="Yes button" value={s.popup_button} onChange={(v) => set({ popup_button: v })} placeholder="Yes, I want {discount} off" autoComplete="off" />
                <TextField label="Decline link" value={s.popup_decline} onChange={(v) => set({ popup_decline: v })} placeholder="No thanks" autoComplete="off" />
              </BlockStack>
            </Card>

            <Banner tone="info">
              <p>How it works: after a visitor views a product a floating icon appears. Tapping it shows this pop-up (offer → email), then the bundle. Browsed <b>2–3 products</b> → bundle + similar products; <b>1 product</b> → that product + similar products to build a bundle. Complementary products come from your Shopify recommendations automatically.</p>
            </Banner>
          </BlockStack>
        </Layout.Section>

        <Layout.Section variant="oneHalf">
          <Box position="sticky" insetBlockStart="500">
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">Live preview</Text>
                <WidgetPreview variant="popup" settings={{ ...toPublic(s), storeName: storeName || 'Your Store' }} />
                <Text as="p" variant="bodySm" tone="subdued">The real pop-up. Click through “Yes” → the email step to see the whole flow.</Text>
              </BlockStack>
            </Card>
          </Box>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

function toPublic(s) {
  return {
    primaryColor: s.primary_color,
    secondaryColor: s.secondary_color,
    fontFamily: s.font_family,
    locale: s.locale,
    currency: s.currency,
    enabled: true,
    popup: {
      enabled: true, // always enabled in the preview so you can see it
      discount: Number(s.popup_discount),
      discountType: s.popup_discount_type,
      headline: s.popup_headline,
      subheadline: s.popup_subheadline,
      button: s.popup_button,
      decline: s.popup_decline,
      image: s.popup_image,
      collectName: s.popup_collect_name,
      delaySeconds: 0,
    },
  };
}
