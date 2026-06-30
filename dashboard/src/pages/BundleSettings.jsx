import React, { useEffect, useState, useCallback } from 'react';
import {
  Page, Layout, Card, BlockStack, InlineStack, Text, RangeSlider, ButtonGroup,
  Button, TextField, Checkbox, Select, Divider, Badge, Box, SkeletonBodyText,
  InlineGrid, Banner,
} from '@shopify/polaris';
import { api } from '../lib/api.js';
import { useToast } from '../App.jsx';

export default function BundleSettingsPage() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [s, setS] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.getSettings();
        setS(normalize(res.settings));
      } catch (e) {
        toast(e.message, true);
      } finally {
        setLoading(false);
      }
    })();
  }, [toast]);

  const set = useCallback((patch) => setS((prev) => ({ ...prev, ...patch })), []);
  const setTier = (key, val) => setS((prev) => ({ ...prev, tiers: { ...prev.tiers, [key]: clampNum(val) } }));

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        trigger_threshold: s.trigger_threshold,
        discount_type: s.discount_type,
        tiers: s.tiers,
        value_rules: s.value_rules,
        max_discount_cap: Number(s.max_discount_cap),
        disable_when_sale: s.disable_when_sale,
        min_bundle_value: Number(s.min_bundle_value),
        excluded: {
          products: splitIds(s.excludedProducts),
          collections: splitIds(s.excludedCollections),
        },
        enabled: s.enabled,
      };
      const res = await api.saveSettings(payload);
      setS(normalize(res.settings));
      toast('Bundle settings saved');
    } catch (e) {
      toast(e.message, true);
    } finally {
      setSaving(false);
    }
  };

  if (loading || !s) {
    return <Page title="Bundle Settings"><Card><SkeletonBodyText lines={12} /></Card></Page>;
  }

  const unit = s.discount_type === 'percentage' ? '%' : s.currency || 'EUR';

  return (
    <Page
      title="Bundle Settings"
      subtitle="Control when the widget appears and how generous the discount is."
      primaryAction={{ content: 'Save', onAction: save, loading: saving }}
    >
      <BlockStack gap="500">
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">Trigger</Text>
                <Text as="p" tone="subdued" variant="bodySm">
                  Minimum number of products a visitor must view before the widget appears.
                </Text>
                <RangeSlider
                  label={`Show widget after ${s.trigger_threshold} products viewed`}
                  min={2}
                  max={5}
                  value={s.trigger_threshold}
                  onChange={(v) => set({ trigger_threshold: v })}
                  output
                />
                <Divider />
                <Checkbox
                  label="Widget enabled"
                  helpText="Turn the storefront widget on or off without uninstalling."
                  checked={s.enabled}
                  onChange={(v) => set({ enabled: v })}
                />
              </BlockStack>
            </Card>

            <Box paddingBlockStart="400">
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">Discount by bundle size</Text>
                  <ButtonGroup variant="segmented">
                    <Button pressed={s.discount_type === 'percentage'} onClick={() => set({ discount_type: 'percentage' })}>
                      Percentage off
                    </Button>
                    <Button pressed={s.discount_type === 'fixed'} onClick={() => set({ discount_type: 'fixed' })}>
                      Fixed amount off
                    </Button>
                  </ButtonGroup>
                  <InlineGrid columns={{ xs: 1, sm: 3 }} gap="300">
                    <TierField label="2 products" value={s.tiers['2']} unit={unit} onChange={(v) => setTier('2', v)} />
                    <TierField label="3 products" value={s.tiers['3']} unit={unit} onChange={(v) => setTier('3', v)} />
                    <TierField label="4+ products" value={s.tiers['4']} unit={unit} onChange={(v) => setTier('4', v)} />
                  </InlineGrid>
                </BlockStack>
              </Card>
            </Box>

            <Box paddingBlockStart="400">
              <Card>
                <BlockStack gap="400">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text as="h2" variant="headingMd">Bundle-value rules</Text>
                    <Badge tone="info">Optional</Badge>
                  </InlineStack>
                  <Text as="p" tone="subdued" variant="bodySm">
                    Reward bigger carts. When the bundle subtotal is above a threshold, apply this
                    discount instead of the size tier. Highest matching threshold wins.
                  </Text>
                  <ValueRulesEditor
                    rules={s.value_rules}
                    currency={s.currency}
                    onChange={(rules) => set({ value_rules: rules })}
                  />
                </BlockStack>
              </Card>
            </Box>
          </Layout.Section>

          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">Safety &amp; limits</Text>
                <TextField
                  label="Maximum discount cap"
                  type="number"
                  value={String(s.max_discount_cap)}
                  onChange={(v) => set({ max_discount_cap: v })}
                  suffix={unit}
                  helpText="Hard ceiling. The discount will never exceed this, whatever the rules say."
                  autoComplete="off"
                />
                <TextField
                  label="Minimum bundle value"
                  type="number"
                  value={String(s.min_bundle_value)}
                  onChange={(v) => set({ min_bundle_value: v })}
                  prefix={s.currency === 'EUR' ? '€' : ''}
                  helpText="Only offer a discount once the bundle subtotal exceeds this."
                  autoComplete="off"
                />
                <Divider />
                <Checkbox
                  label="Don't stack on a sitewide sale"
                  checked={s.disable_when_sale}
                  onChange={(v) => set({ disable_when_sale: v })}
                  helpText="Disable the widget discount while a storewide sale is running."
                />
              </BlockStack>
            </Card>

            <Box paddingBlockStart="400">
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">Exclusions</Text>
                  <Text as="p" tone="subdued" variant="bodySm">
                    Blacklist items that should never be bundled. Comma-separated IDs.
                  </Text>
                  <TextField
                    label="Excluded product IDs"
                    value={s.excludedProducts}
                    onChange={(v) => set({ excludedProducts: v })}
                    placeholder="e.g. 8123456789, 8987654321"
                    autoComplete="off"
                  />
                  <TextField
                    label="Excluded collection IDs"
                    value={s.excludedCollections}
                    onChange={(v) => set({ excludedCollections: v })}
                    placeholder="e.g. 412233445"
                    autoComplete="off"
                  />
                </BlockStack>
              </Card>
            </Box>
          </Layout.Section>
        </Layout>

        <Banner tone="info">
          <p>Tip: percentage discounts feel more generous on lower-priced catalogues; fixed amounts work
          better for higher-ticket bundles. The cap protects your margin either way.</p>
        </Banner>
      </BlockStack>
    </Page>
  );
}

function TierField({ label, value, unit, onChange }) {
  return (
    <TextField
      label={label}
      type="number"
      value={String(value ?? 0)}
      onChange={onChange}
      suffix={unit}
      autoComplete="off"
    />
  );
}

function ValueRulesEditor({ rules, currency, onChange }) {
  const add = () => onChange([...(rules || []), { min_value: 100, type: 'percentage', amount: 20 }]);
  const update = (i, patch) => onChange(rules.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const remove = (i) => onChange(rules.filter((_, idx) => idx !== i));

  return (
    <BlockStack gap="300">
      {(rules || []).length === 0 && (
        <Text as="p" tone="subdued" variant="bodySm">No value rules yet.</Text>
      )}
      {(rules || []).map((r, i) => (
        <Box key={i} padding="300" borderColor="border" borderWidth="025" borderRadius="200">
          <InlineStack gap="200" blockAlign="end" wrap>
            <div style={{ minWidth: 130 }}>
              <TextField
                label="If subtotal ≥"
                type="number"
                value={String(r.min_value)}
                onChange={(v) => update(i, { min_value: Number(v) })}
                prefix={currency === 'EUR' ? '€' : ''}
                autoComplete="off"
              />
            </div>
            <div style={{ minWidth: 130 }}>
              <Select
                label="Apply"
                options={[
                  { label: 'Percentage off', value: 'percentage' },
                  { label: 'Fixed amount off', value: 'fixed' },
                ]}
                value={r.type}
                onChange={(v) => update(i, { type: v })}
              />
            </div>
            <div style={{ minWidth: 110 }}>
              <TextField
                label="Amount"
                type="number"
                value={String(r.amount)}
                onChange={(v) => update(i, { amount: Number(v) })}
                suffix={r.type === 'percentage' ? '%' : currency}
                autoComplete="off"
              />
            </div>
            <Button tone="critical" variant="tertiary" onClick={() => remove(i)}>Remove</Button>
          </InlineStack>
        </Box>
      ))}
      <div>
        <Button onClick={add}>Add value rule</Button>
      </div>
    </BlockStack>
  );
}

// ── helpers ──
function normalize(settings) {
  const tiers = settings.tiers || { 2: 10, 3: 15, 4: 20 };
  return {
    ...settings,
    tiers: { 2: tiers['2'] ?? 0, 3: tiers['3'] ?? 0, 4: tiers['4'] ?? 0 },
    value_rules: settings.value_rules || [],
    excludedProducts: (settings.excluded?.products || []).join(', '),
    excludedCollections: (settings.excluded?.collections || []).join(', '),
  };
}
function splitIds(str) {
  return String(str || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}
function clampNum(v) {
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
}
