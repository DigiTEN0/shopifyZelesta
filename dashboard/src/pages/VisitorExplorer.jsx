import React, { useEffect, useState, useCallback } from 'react';
import {
  Page, Layout, Card, BlockStack, InlineStack, Text, Select, Button, Box, Badge,
  SkeletonBodyText, InlineGrid, Divider, Banner, Modal, Spinner,
} from '@shopify/polaris';
import { api } from '../lib/api.js';
import { useToast } from '../App.jsx';
import { money, shortDate } from '../lib/format.js';

const RANGE_OPTIONS = [
  { label: 'This week', value: 'this-week' },
  { label: 'This month', value: 'this-month' },
  { label: 'Last month', value: 'last-month' },
];

export default function VisitorExplorerPage() {
  const toast = useToast();
  const [range, setRange] = useState('this-month');
  const [stealth, setStealth] = useState(null);
  const [savingStealth, setSavingStealth] = useState(false);
  const [potential, setPotential] = useState(null);
  const [visitors, setVisitors] = useState(null);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const currency = 'EUR';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, pot, vis] = await Promise.all([
        stealth === null ? api.getSettings() : Promise.resolve(null),
        api.getPotential(range),
        api.getVisitors(100, 0),
      ]);
      if (s) setStealth(!!s.settings.stealth_mode);
      setPotential(pot);
      setVisitors(vis);
    } catch (e) {
      toast(e.message, true);
    } finally {
      setLoading(false);
    }
  }, [range, stealth, toast]);

  useEffect(() => { load(); }, [range]); // eslint-disable-line

  const toggleStealth = async () => {
    setSavingStealth(true);
    try {
      const res = await api.saveSettings({ stealth_mode: !stealth });
      setStealth(!!res.settings.stealth_mode);
      toast(!stealth ? 'Stealth Mode on — silently gathering proof' : 'Stealth Mode off');
    } catch (e) {
      toast(e.message, true);
    } finally {
      setSavingStealth(false);
    }
  };

  const openVisitor = async (id) => {
    setDetail({ id, loading: true });
    setDetailLoading(true);
    try {
      const v = await api.getVisitor(id);
      setDetail(v);
    } catch (e) {
      toast(e.message, true);
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  };

  return (
    <Page
      title="Visitor Explorer"
      subtitle="Stealth Mode silently tracks anonymous browsing and estimates the revenue a bundle strategy could unlock — before you ever show the widget."
    >
      <BlockStack gap="500">
        {/* Stealth toggle */}
        {stealth !== null && (
          <Banner
            tone={stealth ? 'success' : 'info'}
            title={stealth ? 'Stealth Mode is ON — gathering proof' : 'Stealth Mode is OFF'}
            action={{ content: savingStealth ? 'Saving…' : (stealth ? 'Turn off' : 'Turn on Stealth Mode'), onAction: toggleStealth, disabled: savingStealth }}
          >
            <p>
              {stealth
                ? 'Every visit is tracked anonymously in the background. No pop-up, no widget, zero change to the storefront. Watch the potential revenue build up below.'
                : 'Turn this on to silently record browsing and see what a bundle strategy could earn — without touching the storefront yet.'}
            </p>
          </Banner>
        )}

        {/* Potential revenue */}
        <Card>
          <BlockStack gap="400">
            <InlineStack align="space-between" blockAlign="center">
              <Text as="h2" variant="headingMd">Potential revenue</Text>
              <div style={{ minWidth: 170 }}>
                <Select label="" labelHidden options={RANGE_OPTIONS} value={range} onChange={setRange} />
              </div>
            </InlineStack>
            {loading || !potential ? (
              <SkeletonBodyText lines={4} />
            ) : (
              <>
                <InlineGrid columns={{ xs: 1, sm: 2, lg: 4 }} gap="400">
                  <Stat label="Potential bundle revenue" value={money(potential.potentialBundleRevenue, currency)} tone="success" />
                  <Stat label="Potential bundle orders" value={String(potential.potentialBundleOrders)} />
                  <Stat label="Average bundle value" value={money(potential.averageBundleValue, currency)} />
                  <Stat label="Potential AOV increase" value={`+${potential.potentialAovIncrease}%`} tone="success" />
                </InlineGrid>
                <Text as="p" tone="subdued" variant="bodySm">
                  Conservative estimate: of the <b>{potential.bundleIntentSessions}</b> visits that browsed 2+ products
                  ({potential.bundleIntentRate}% of all visits), we assume only <b>{Math.round(potential.captureRate * 100)}%</b> would
                  complete a bundle. Real numbers are typically higher once the widget is live.
                </Text>
              </>
            )}
          </BlockStack>
        </Card>

        <Layout>
          {/* Visitor table */}
          <Layout.Section>
            <Card padding="0">
              <Box padding="400"><Text as="h2" variant="headingMd">Visitors</Text></Box>
              <Divider />
              {loading || !visitors ? (
                <Box padding="400"><SkeletonBodyText lines={8} /></Box>
              ) : visitors.visitors.length === 0 ? (
                <Box padding="400">
                  <Text as="p" tone="subdued">No visitors tracked yet. Turn on Stealth Mode and traffic will start appearing here.</Text>
                </Box>
              ) : (
                <BlockStack gap="0">
                  <Box padding="300" background="bg-surface-secondary">
                    <InlineStack gap="200" wrap={false}>
                      <div style={{ flex: 2 }}><Text as="span" variant="bodySm" tone="subdued">Visitor</Text></div>
                      <div style={{ width: 70, textAlign: 'right' }}><Text as="span" variant="bodySm" tone="subdued">Sessions</Text></div>
                      <div style={{ width: 70, textAlign: 'right' }}><Text as="span" variant="bodySm" tone="subdued">Viewed</Text></div>
                      <div style={{ width: 100, textAlign: 'right' }}><Text as="span" variant="bodySm" tone="subdued">Potential</Text></div>
                      <div style={{ width: 90, textAlign: 'right' }}><Text as="span" variant="bodySm" tone="subdued">Purchased</Text></div>
                    </InlineStack>
                  </Box>
                  {visitors.visitors.map((v) => (
                    <div key={v.id} style={{ cursor: 'pointer' }} onClick={() => openVisitor(v.id)}>
                      <Box padding="300" borderColor="border" borderBlockEndWidth="025">
                        <InlineStack gap="200" wrap={false} blockAlign="center">
                          <div style={{ flex: 2, minWidth: 0 }}>
                            <Text as="span" variant="bodyMd" fontWeight="medium" truncate>{v.id}</Text>
                            <div><Text as="span" variant="bodySm" tone="subdued">last seen {shortDate(v.lastSeen)}</Text></div>
                          </div>
                          <div style={{ width: 70, textAlign: 'right' }}><Text as="span" variant="bodyMd">{v.sessions}</Text></div>
                          <div style={{ width: 70, textAlign: 'right' }}><Text as="span" variant="bodyMd">{v.viewedProducts}</Text></div>
                          <div style={{ width: 100, textAlign: 'right' }}><Text as="span" variant="bodyMd" fontWeight="semibold">{money(v.potentialValue, currency)}</Text></div>
                          <div style={{ width: 90, textAlign: 'right' }}>
                            {v.purchased ? <Badge tone="success">Yes</Badge> : <Badge>No</Badge>}
                          </div>
                        </InlineStack>
                      </Box>
                    </div>
                  ))}
                </BlockStack>
              )}
            </Card>
          </Layout.Section>

          {/* Product intelligence */}
          <Layout.Section variant="oneThird">
            <BlockStack gap="400">
              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">Most viewed products</Text>
                  <Divider />
                  {!potential || potential.topProducts?.length === 0 ? (
                    <Text as="p" tone="subdued" variant="bodySm">No data yet.</Text>
                  ) : (
                    <BlockStack gap="200">
                      {(potential?.topProducts || []).map((p, i) => (
                        <InlineStack key={i} align="space-between" blockAlign="center" wrap={false}>
                          <InlineStack gap="200" blockAlign="center" wrap={false}>
                            <Text as="span" variant="bodySm" tone="subdued">{i + 1}.</Text>
                            <Text as="span" variant="bodyMd" truncate>{p.title || '(untitled)'}</Text>
                          </InlineStack>
                          <Badge>{`${p.views}×`}</Badge>
                        </InlineStack>
                      ))}
                    </BlockStack>
                  )}
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">Viewed together</Text>
                  <Text as="p" tone="subdued" variant="bodySm">Your best bundle candidates.</Text>
                  <Divider />
                  {!potential || potential.coViewed?.length === 0 ? (
                    <Text as="p" tone="subdued" variant="bodySm">No data yet.</Text>
                  ) : (
                    <BlockStack gap="300">
                      {(potential?.coViewed || []).map((c, i) => (
                        <InlineStack key={i} align="space-between" blockAlign="center" wrap={false}>
                          <Text as="span" variant="bodySm">
                            <b>{c.a || '?'}</b> + <b>{c.b || '?'}</b>
                          </Text>
                          <Badge tone="info">{`${c.together}×`}</Badge>
                        </InlineStack>
                      ))}
                    </BlockStack>
                  )}
                </BlockStack>
              </Card>
            </BlockStack>
          </Layout.Section>
        </Layout>
      </BlockStack>

      {/* Visitor detail modal */}
      <Modal
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail?.id || 'Visitor'}
        large
      >
        <Modal.Section>
          {detailLoading || detail?.loading ? (
            <InlineStack align="center"><Spinner size="small" /></InlineStack>
          ) : detail ? (
            <BlockStack gap="400">
              <InlineGrid columns={{ xs: 2, sm: 3 }} gap="300">
                <Stat label="First seen" value={shortDate(detail.firstSeen)} small />
                <Stat label="Last seen" value={shortDate(detail.lastSeen)} small />
                <Stat label="Sessions" value={String(detail.totalSessions)} small />
                <Stat label="Products viewed" value={String(detail.totalProductsViewed)} small />
                <Stat label="Potential value" value={money(detail.potentialValue, currency)} small tone="success" />
                <Stat label="Purchased" value={detail.purchased ? 'Yes' : 'No'} small />
              </InlineGrid>
              <Divider />
              <Text as="h3" variant="headingSm">Session history</Text>
              <BlockStack gap="300">
                {detail.sessions.map((s, si) => (
                  <Card key={s.id} background="bg-surface-secondary">
                    <BlockStack gap="150">
                      <Text as="span" variant="bodySm" tone="subdued">
                        Session {detail.sessions.length - si} · {shortDate(s.startedAt)}
                      </Text>
                      <BlockStack gap="050">
                        {s.events.map((e, ei) => (
                          <InlineStack key={ei} gap="200" blockAlign="center" wrap={false}>
                            <Badge tone={e.type === 'purchase' ? 'success' : e.type === 'add_to_cart' ? 'attention' : undefined} size="small">
                              {e.type === 'product_view' ? 'Viewed' : e.type === 'add_to_cart' ? 'Added' : 'Purchased'}
                            </Badge>
                            <Text as="span" variant="bodyMd">{e.title || (e.type === 'purchase' ? 'Order' : '')}</Text>
                            {e.price ? <Text as="span" variant="bodySm" tone="subdued">{money(e.price, currency)}</Text> : null}
                          </InlineStack>
                        ))}
                      </BlockStack>
                    </BlockStack>
                  </Card>
                ))}
              </BlockStack>
            </BlockStack>
          ) : null}
        </Modal.Section>
      </Modal>
    </Page>
  );
}

function Stat({ label, value, tone, small }) {
  return (
    <BlockStack gap="050">
      <Text as="span" variant="bodySm" tone="subdued">{label}</Text>
      <Text as="p" variant={small ? 'headingMd' : 'heading2xl'} tone={tone === 'success' ? 'success' : undefined}>{value}</Text>
    </BlockStack>
  );
}
