import React, { useEffect, useState, useCallback } from 'react';
import {
  Page, Layout, Card, BlockStack, InlineStack, Text, Select, Button, Box,
  SkeletonBodyText, InlineGrid, Divider, Badge, DatePicker, Popover, TextField,
} from '@shopify/polaris';
import { api } from '../lib/api.js';
import { useToast } from '../App.jsx';
import { money, percent } from '../lib/format.js';
import { LineChart, BarChart } from '../components/Charts.jsx';

const RANGES = [
  { label: 'This week', value: 'this-week' },
  { label: 'This month', value: 'this-month' },
  { label: 'Last month', value: 'last-month' },
  { label: 'Custom', value: 'custom' },
];

export default function AnalyticsPage() {
  const toast = useToast();
  const [range, setRange] = useState('this-month');
  const [custom, setCustom] = useState({ from: null, to: null });
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [{ month, year }, setMonth] = useState({ month: new Date().getMonth(), year: new Date().getFullYear() });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const from = range === 'custom' && custom.from ? custom.from.toISOString() : undefined;
      const to = range === 'custom' && custom.to ? custom.to.toISOString() : undefined;
      const res = await api.getAnalytics(range, from, to);
      setData(res);
    } catch (e) {
      toast(e.message, true);
    } finally {
      setLoading(false);
    }
  }, [range, custom, toast]);

  useEffect(() => { load(); }, [load]);

  const currency = data?.recentOrders?.[0]?.currency || 'EUR';

  const exportCsv = () => {
    if (!data) return;
    const rows = [['Order', 'Date', 'Discount code', 'Order value', 'Discount']];
    data.recentOrders.forEach((o) =>
      rows.push([o.orderNumber, o.createdAt, o.discountCodes.join('|'), o.total, o.discountTotal])
    );
    rows.push([]);
    rows.push(['Top products', 'Times bundled']);
    data.topProducts.forEach((p) => rows.push([p.title, p.count]));
    downloadCsv(rows, `bundle-analytics-${range}.csv`);
  };

  return (
    <Page
      title="Analytics"
      subtitle="Sourced from orders carrying a BUNDLE- discount code."
      primaryAction={{ content: 'Export CSV', onAction: exportCsv, disabled: !data }}
    >
      <BlockStack gap="500">
        <Card>
          <InlineStack gap="300" blockAlign="end">
            <div style={{ minWidth: 200 }}>
              <Select label="Date range" options={RANGES} value={range} onChange={setRange} />
            </div>
            {range === 'custom' && (
              <Popover
                active={pickerOpen}
                onClose={() => setPickerOpen(false)}
                activator={
                  <Button onClick={() => setPickerOpen((o) => !o)} disclosure>
                    {custom.from && custom.to
                      ? `${custom.from.toLocaleDateString()} – ${custom.to.toLocaleDateString()}`
                      : 'Pick dates'}
                  </Button>
                }
              >
                <Box padding="300">
                  <DatePicker
                    month={month}
                    year={year}
                    onMonthChange={(m, y) => setMonth({ month: m, year: y })}
                    selected={{ start: custom.from || new Date(), end: custom.to || new Date() }}
                    onChange={({ start, end }) => setCustom({ from: start, to: end })}
                    allowRange
                  />
                </Box>
              </Popover>
            )}
            <Button onClick={load} loading={loading}>Refresh</Button>
          </InlineStack>
        </Card>

        {loading || !data ? (
          <Card><SkeletonBodyText lines={10} /></Card>
        ) : (
          <>
            <InlineGrid columns={{ xs: 1, sm: 2, lg: 4 }} gap="400">
              <Metric label="Bundle revenue" value={money(data.bundleRevenue, currency)} />
              <Metric label="Bundles created" value={String(data.bundleOrderCount)} />
              <Metric label="Widget trigger rate" value={`${data.triggerRate}%`} sub="of sessions" />
              <Metric label="Conversion rate" value={`${data.conversionRate}%`} sub="appearances → add to cart" />
            </InlineGrid>

            <Layout>
              <Layout.Section>
                <Card>
                  <BlockStack gap="300">
                    <Text as="h2" variant="headingMd">Bundle revenue over time</Text>
                    <LineChart data={data.revenueOverTime} format={(v) => money(v, currency)} />
                  </BlockStack>
                </Card>
                <Box paddingBlockStart="400">
                  <Card>
                    <BlockStack gap="300">
                      <Text as="h2" variant="headingMd">Bundles created per day</Text>
                      <BarChart data={data.bundlesPerDay} />
                    </BlockStack>
                  </Card>
                </Box>
              </Layout.Section>

              <Layout.Section variant="oneThird">
                <Card>
                  <BlockStack gap="300">
                    <Text as="h2" variant="headingMd">Most bundled products</Text>
                    <Divider />
                    {data.topProducts.length === 0 ? (
                      <Text as="p" tone="subdued" variant="bodySm">No data yet.</Text>
                    ) : (
                      <BlockStack gap="200">
                        {data.topProducts.map((p, i) => (
                          <InlineStack key={i} align="space-between" blockAlign="center" wrap={false}>
                            <InlineStack gap="200" blockAlign="center" wrap={false}>
                              <Text as="span" variant="bodySm" tone="subdued">{i + 1}.</Text>
                              <Text as="span" variant="bodyMd">{p.title}</Text>
                            </InlineStack>
                            <Badge>{`${p.count}×`}</Badge>
                          </InlineStack>
                        ))}
                      </BlockStack>
                    )}
                  </BlockStack>
                </Card>

                <Box paddingBlockStart="400">
                  <Card>
                    <BlockStack gap="200">
                      <Text as="h2" variant="headingMd">Funnel</Text>
                      <FunnelRow label="Widget shown" value={data.widgetShown} />
                      <FunnelRow label="Added to cart" value={data.addToCart} />
                      <Divider />
                      <InlineStack align="space-between">
                        <Text as="span" variant="bodySm" tone="subdued">AOV lift vs store</Text>
                        <Text as="span" variant="bodyMd" fontWeight="semibold" tone={data.aovLift >= 0 ? 'success' : 'critical'}>
                          {percent(data.aovLift)}
                        </Text>
                      </InlineStack>
                    </BlockStack>
                  </Card>
                </Box>
              </Layout.Section>
            </Layout>
          </>
        )}
      </BlockStack>
    </Page>
  );
}

function Metric({ label, value, sub }) {
  return (
    <Card>
      <BlockStack gap="100">
        <Text as="span" variant="bodySm" tone="subdued">{label}</Text>
        <Text as="p" variant="headingXl">{value}</Text>
        {sub ? <Text as="span" variant="bodySm" tone="subdued">{sub}</Text> : null}
      </BlockStack>
    </Card>
  );
}

function FunnelRow({ label, value }) {
  return (
    <InlineStack align="space-between">
      <Text as="span" variant="bodyMd">{label}</Text>
      <Text as="span" variant="bodyMd" fontWeight="semibold">{value}</Text>
    </InlineStack>
  );
}

function downloadCsv(rows, filename) {
  const csv = rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
