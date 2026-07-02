import React, { useEffect, useState } from 'react';
import {
  Page, Layout, Card, Text, BlockStack, InlineStack, InlineGrid, Banner, Badge,
  Button, SkeletonBodyText, SkeletonDisplayText, Box, Divider, EmptyState,
} from '@shopify/polaris';
import { api, SHOP } from '../lib/api.js';
import { money, percent, shortDate } from '../lib/format.js';

export default function DashboardPage({ goTo }) {
  const [loading, setLoading] = useState(true);
  const [analytics, setAnalytics] = useState(null);
  const [meta, setMeta] = useState(null);
  const [settings, setSettings] = useState(null);
  const [error, setError] = useState(null);
  const [toggling, setToggling] = useState(false);

  const toggleWidget = async () => {
    if (!settings) return;
    setToggling(true);
    try {
      const res = await api.saveSettings({ enabled: !settings.enabled });
      setSettings(res.settings);
    } catch (e) {
      setError(e.message);
    } finally {
      setToggling(false);
    }
  };

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [a, s] = await Promise.all([
          api.getAnalytics('this-month'),
          api.getSettings(),
        ]);
        if (!active) return;
        setAnalytics(a);
        setMeta(s.meta);
        setSettings(s.settings);
      } catch (e) {
        if (active) setError(e.message);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  const currency = settings?.currency || 'EUR';

  return (
    <Page title="Dashboard" subtitle={SHOP}>
      <BlockStack gap="500">
        {error && (
          <Banner tone="critical" title="Couldn't load your data">
            <p>{error}</p>
          </Banner>
        )}

        {!loading && settings && settings.enabled && meta?.scriptTagInstalled && (
          <Banner
            tone="success"
            title="Widget is live on your store"
            action={{ content: toggling ? 'Deactivating…' : 'Deactivate widget', onAction: toggleWidget, disabled: toggling }}
          >
            <p>Your bundle widget is active and tracking visitor browsing right now. Turn it off here whenever you want.</p>
          </Banner>
        )}

        {!loading && settings && !settings.enabled && (
          <Banner
            tone="warning"
            title="Widget is deactivated"
            action={{ content: toggling ? 'Activating…' : 'Activate widget', onAction: toggleWidget, disabled: toggling }}
          >
            <p>The widget is off and won’t show on your store. You decide exactly when it goes live — click activate when you’re ready.</p>
          </Banner>
        )}

        {!loading && settings && settings.enabled && !meta?.scriptTagInstalled && (
          <Banner tone="warning" title="Widget not installed yet">
            <p>The storefront script isn’t registered. Reinstall the app to inject the widget.</p>
          </Banner>
        )}

        {/* Hero stats */}
        <InlineGrid columns={{ xs: 1, sm: 2, lg: 3 }} gap="400">
          <StatCard
            label="Bundle Revenue (this month)"
            value={loading ? null : money(analytics.bundleRevenue, currency)}
            tone="success"
          />
          <StatCard
            label="Orders Influenced"
            value={loading ? null : String(analytics.bundleOrderCount)}
          />
          <StatCard
            label="AOV Lift vs store avg"
            value={loading ? null : percent(analytics.aovLift)}
            tone={!loading && analytics.aovLift >= 0 ? 'success' : 'critical'}
          />
        </InlineGrid>

        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="h2" variant="headingMd">Recent bundle orders</Text>
                  <Button variant="plain" onClick={() => goTo('analytics')}>View analytics</Button>
                </InlineStack>
                <Divider />
                {loading ? (
                  <SkeletonBodyText lines={6} />
                ) : analytics.recentOrders.length === 0 ? (
                  <EmptyState
                    heading="No bundle orders yet"
                    image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                  >
                    <p>Once a customer checks out with a BUNDLE- code, it shows up here in real time.</p>
                  </EmptyState>
                ) : (
                  <BlockStack gap="0">
                    {analytics.recentOrders.map((o, i) => (
                      <Box key={i} paddingBlock="300" borderColor="border" borderBlockEndWidth={i < analytics.recentOrders.length - 1 ? '025' : '0'}>
                        <InlineStack align="space-between" blockAlign="center" wrap={false}>
                          <BlockStack gap="050">
                            <InlineStack gap="200" blockAlign="center">
                              <Text as="span" variant="bodyMd" fontWeight="semibold">{o.orderNumber}</Text>
                              <Badge tone="info" size="small">{o.discountCodes[0]}</Badge>
                            </InlineStack>
                            <Text as="span" variant="bodySm" tone="subdued">
                              {o.products.slice(0, 3).join(', ')}{o.products.length > 3 ? ` +${o.products.length - 3}` : ''} · {shortDate(o.createdAt)}
                            </Text>
                          </BlockStack>
                          <BlockStack gap="050" inlineAlign="end">
                            <Text as="span" variant="bodyMd" fontWeight="semibold">{money(o.total, o.currency || currency)}</Text>
                            <Text as="span" variant="bodySm" tone="success">−{money(o.discountTotal, o.currency || currency)}</Text>
                          </BlockStack>
                        </InlineStack>
                      </Box>
                    ))}
                  </BlockStack>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">Setup checklist</Text>
                <ChecklistItem done label="Connect your store (OAuth)" />
                <ChecklistItem done={!!meta?.scriptTagInstalled} label="Widget installed on storefront" onClick={() => goTo('customise')} />
                <ChecklistItem
                  done={!loading && settings && Object.keys(settings.tiers || {}).length > 0}
                  label="Set your first discount rule"
                  onClick={() => goTo('settings')}
                />
                <ChecklistItem
                  done={!loading && settings && settings.popup && settings.popup.enabled}
                  label="Turn on the lead-capture pop-up"
                  onClick={() => goTo('popups')}
                />
                <Divider />
                <Button onClick={() => goTo('customise')} fullWidth>Customise the widget</Button>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}

function StatCard({ label, value, hint, tone }) {
  return (
    <Card>
      <BlockStack gap="200">
        <Text as="span" variant="bodySm" tone="subdued">{label}</Text>
        {value === null ? (
          <SkeletonDisplayText size="medium" />
        ) : (
          <Text as="p" variant="heading2xl" tone={tone === 'success' ? 'success' : tone === 'critical' ? 'critical' : undefined}>
            {value}
          </Text>
        )}
        {hint ? <Text as="span" variant="bodySm" tone="subdued">{hint}</Text> : null}
      </BlockStack>
    </Card>
  );
}

function ChecklistItem({ done, label, onClick }) {
  return (
    <InlineStack gap="300" blockAlign="center" wrap={false}>
      <span style={{
        width: 22, height: 22, borderRadius: '50%', flex: '0 0 auto',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: done ? '#108043' : '#E3E3E3', color: '#fff', fontSize: 13, fontWeight: 700,
      }}>{done ? '✓' : ''}</span>
      {onClick && !done ? (
        <Button variant="plain" onClick={onClick}>{label}</Button>
      ) : (
        <Text as="span" variant="bodyMd" tone={done ? 'subdued' : undefined}>{label}</Text>
      )}
    </InlineStack>
  );
}
