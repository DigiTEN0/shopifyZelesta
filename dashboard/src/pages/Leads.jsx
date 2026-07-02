import React, { useEffect, useState } from 'react';
import {
  Page, Card, BlockStack, InlineStack, Text, Badge, Button, Box, Collapsible,
  SkeletonBodyText, EmptyState, InlineGrid, Divider, Thumbnail,
} from '@shopify/polaris';
import { api, SHOP } from '../lib/api.js';
import { useToast } from '../App.jsx';
import { shortDate } from '../lib/format.js';

const MODE_TONE = { bundle: 'success', single: 'info', welcome: 'attention' };

export default function LeadsPage({ goTo }) {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [leads, setLeads] = useState([]);
  const [stats, setStats] = useState({ total: 0, this_month: 0 });

  useEffect(() => {
    (async () => {
      try {
        const res = await api.getLeads();
        setLeads(res.leads || []);
        setStats(res.stats || { total: 0, this_month: 0 });
      } catch (e) {
        toast(e.message, true);
      } finally {
        setLoading(false);
      }
    })();
  }, [toast]);

  const exportCsv = () => {
    const rows = [['Email', 'Name', 'Browsed products', 'Discount code', 'Type', 'Date', 'In Shopify']];
    leads.forEach((l) =>
      rows.push([
        l.email, l.name || '', (l.product_titles || []).join(' | '),
        l.discount_code || '', l.mode || '', l.created_at, l.shopify_customer_id ? 'yes' : 'no',
      ])
    );
    const csv = rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url; a.download = 'bundleboost-leads.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Page
      title="Leads"
      subtitle="Every email captured by the pop-up, tied to the products that visitor browsed."
      primaryAction={{ content: 'Export CSV', onAction: exportCsv, disabled: !leads.length }}
      secondaryActions={[{ content: 'Pop-up settings', onAction: () => goTo('popups') }]}
    >
      <BlockStack gap="500">
        <InlineGrid columns={{ xs: 1, sm: 2 }} gap="400">
          <Card><BlockStack gap="100"><Text as="span" variant="bodySm" tone="subdued">Total leads</Text><Text as="p" variant="heading2xl">{loading ? '—' : stats.total}</Text></BlockStack></Card>
          <Card><BlockStack gap="100"><Text as="span" variant="bodySm" tone="subdued">Captured this month</Text><Text as="p" variant="heading2xl">{loading ? '—' : stats.this_month}</Text></BlockStack></Card>
        </InlineGrid>

        <Card padding="0">
          {loading ? (
            <Box padding="400"><SkeletonBodyText lines={8} /></Box>
          ) : leads.length === 0 ? (
            <Box padding="400">
              <EmptyState heading="No leads yet" image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png">
                <p>Turn on the pop-up and captured emails — with the products each visitor browsed — will appear here, ready to export for targeted campaigns.</p>
              </EmptyState>
            </Box>
          ) : (
            <BlockStack gap="0">
              {leads.map((l, i) => <LeadRow key={l.email} lead={l} last={i === leads.length - 1} />)}
            </BlockStack>
          )}
        </Card>

        <Text as="p" variant="bodySm" tone="subdued">
          Leads are also pushed into <b>Shopify → Customers</b> (marketing-opted-in) when the write_customers
          permission is granted — “Synced” means it reached Shopify, “Local” means it’s stored here only.
        </Text>
      </BlockStack>
    </Page>
  );
}

function LeadRow({ lead, last }) {
  const [open, setOpen] = useState(false);
  const details = lead.product_details && lead.product_details.length
    ? lead.product_details
    : (lead.product_titles || []).map((t) => ({ title: t, image: '', url: '' }));

  return (
    <Box padding="400" borderBlockEndWidth={last ? '0' : '025'} borderColor="border">
      <InlineStack align="space-between" blockAlign="center" wrap={false} gap="300">
        <BlockStack gap="050">
          <InlineStack gap="200" blockAlign="center">
            <Text as="span" variant="bodyMd" fontWeight="semibold">{lead.email}</Text>
            <Badge tone={MODE_TONE[lead.mode] || undefined} size="small">{lead.mode || '—'}</Badge>
            {lead.shopify_customer_id
              ? <Badge tone="success" size="small">Synced</Badge>
              : <Badge size="small">Local</Badge>}
          </InlineStack>
          <Text as="span" variant="bodySm" tone="subdued">
            {lead.name ? lead.name + ' · ' : ''}{details.length} product{details.length === 1 ? '' : 's'} browsed · {shortDate(lead.created_at)}
          </Text>
        </BlockStack>
        <Button variant="tertiary" disclosure={open ? 'up' : 'down'} onClick={() => setOpen((o) => !o)}>
          {open ? 'Hide' : 'Details'}
        </Button>
      </InlineStack>

      <Collapsible open={open} id={`lead-${lead.email}`} transition={{ duration: '150ms' }}>
        <Box paddingBlockStart="300">
          <Divider />
          <Box paddingBlockStart="300">
            <InlineStack gap="300" wrap>
              {details.map((p, idx) => {
                const href = p.url ? `https://${SHOP}${p.url}` : null;
                const card = (
                  <InlineStack gap="200" blockAlign="center" wrap={false}>
                    <Thumbnail source={p.image || 'https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png'} size="small" alt={p.title} />
                    <Text as="span" variant="bodySm">{p.title}</Text>
                  </InlineStack>
                );
                return (
                  <Box key={idx} padding="200" borderColor="border" borderWidth="025" borderRadius="200" minWidth="180px">
                    {href ? <a href={href} target="_blank" rel="noreferrer" style={{ textDecoration: 'none', color: 'inherit' }}>{card}</a> : card}
                  </Box>
                );
              })}
            </InlineStack>
            {lead.discount_code ? (
              <Box paddingBlockStart="300">
                <Text as="span" variant="bodySm" tone="subdued">Code: </Text>
                <Text as="span" variant="bodySm" fontWeight="semibold">{lead.discount_code}</Text>
              </Box>
            ) : null}
          </Box>
        </Box>
      </Collapsible>
    </Box>
  );
}
