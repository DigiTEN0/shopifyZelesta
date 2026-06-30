import React, { useEffect, useState } from 'react';
import {
  Page, Layout, Card, BlockStack, InlineStack, Text, Button, Badge, Divider,
  SkeletonBodyText, Box, DataTable, Banner, List,
} from '@shopify/polaris';
import { api } from '../lib/api.js';
import { useToast } from '../App.jsx';
import { money, monthLabel } from '../lib/format.js';

export default function BillingPage() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [activating, setActivating] = useState(false);
  const [data, setData] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.getBilling('this-month');
        setData(res);
      } catch (e) {
        toast(e.message, true);
      } finally {
        setLoading(false);
      }
    })();
  }, [toast]);

  const activate = async () => {
    setActivating(true);
    try {
      const res = await api.activateBilling();
      if (res.confirmationUrl) {
        // Must break out of the embedded iframe to show Shopify's approval screen.
        if (window.top) window.top.location.href = res.confirmationUrl;
        else window.location.href = res.confirmationUrl;
      }
    } catch (e) {
      toast(e.message, true);
      setActivating(false);
    }
  };

  if (loading || !data) {
    return <Page title="Billing"><Card><SkeletonBodyText lines={10} /></Card></Page>;
  }

  const currency = data.usage.currency || 'EUR';
  const active = data.status?.status === 'active';
  const billingActive = new URLSearchParams(window.location.search).get('billing') === 'active';

  const historyRows = (data.history || []).map((h) => [
    monthLabel(h.month),
    money(h.bundleGmv, currency),
    String(h.orders),
    money(h.fee, currency),
  ]);

  return (
    <Page title="Billing" subtitle="Performance plan — you only pay when the widget makes you money.">
      <BlockStack gap="500">
        {billingActive && (
          <Banner tone="success" title="Billing is active">
            <p>Thanks! Usage charges will be calculated from attributed bundle revenue.</p>
          </Banner>
        )}

        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between" blockAlign="center">
                  <BlockStack gap="100">
                    <Text as="h2" variant="headingLg">Performance Plan</Text>
                    <Text as="span" tone="subdued">0.5% of attributed bundle revenue</Text>
                  </BlockStack>
                  <Badge tone={active ? 'success' : 'attention'}>{active ? 'Active' : 'Not active'}</Badge>
                </InlineStack>
                <Divider />
                <InlineStack gap="800" wrap>
                  <BigStat label="This month's bundle GMV" value={money(data.usage.bundleGmv, currency)} />
                  <BigStat label="Estimated fee" value={money(data.usage.estimatedFee, currency)} highlight />
                  <BigStat label="Attributed orders" value={String(data.usage.bundleOrders)} />
                </InlineStack>
                {!active && (
                  <Box paddingBlockStart="200">
                    <Button variant="primary" onClick={activate} loading={activating}>
                      Activate billing
                    </Button>
                  </Box>
                )}
              </BlockStack>
            </Card>

            <Box paddingBlockStart="400">
              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">Fee history (last 6 months)</Text>
                  <DataTable
                    columnContentTypes={['text', 'numeric', 'numeric', 'numeric']}
                    headings={['Month', 'Bundle GMV', 'Orders', 'Fee']}
                    rows={historyRows}
                  />
                </BlockStack>
              </Card>
            </Box>
          </Layout.Section>

          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">How attribution works</Text>
                <Text as="p" tone="subdued" variant="bodySm">
                  Every bundle the widget creates gets its own one-time discount code prefixed
                  <Text as="span" fontWeight="semibold"> BUNDLE-</Text>. We only ever count orders that
                  actually used one of these codes.
                </Text>
                <List>
                  <List.Item>100% clean — no guesswork or last-click models.</List.Item>
                  <List.Item>If a shopper doesn't use the widget, you pay nothing.</List.Item>
                  <List.Item>Fees are computed from Shopify Orders data, not our own tracking.</List.Item>
                </List>
                <Divider />
                <Text as="p" variant="bodySm" tone="subdued">
                  Charged securely through Shopify's Billing API and shown on your regular Shopify invoice.
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}

function BigStat({ label, value, highlight }) {
  return (
    <BlockStack gap="100">
      <Text as="span" variant="bodySm" tone="subdued">{label}</Text>
      <Text as="p" variant="heading2xl" tone={highlight ? 'success' : undefined}>{value}</Text>
    </BlockStack>
  );
}
