import React, { useEffect, useState } from 'react';
import {
  Page, Card, BlockStack, InlineStack, Text, DataTable, Badge, Button, Box,
  SkeletonBodyText, EmptyState, InlineGrid,
} from '@shopify/polaris';
import { api } from '../lib/api.js';
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
        l.email,
        l.name || '',
        (l.product_titles || []).join(' | '),
        l.discount_code || '',
        l.mode || '',
        l.created_at,
        l.shopify_customer_id ? 'yes' : 'no',
      ])
    );
    const csv = rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'bundleboost-leads.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const tableRows = leads.map((l) => [
    <BlockStack gap="050" key={l.email}>
      <Text as="span" variant="bodyMd" fontWeight="semibold">{l.email}</Text>
      {l.name ? <Text as="span" variant="bodySm" tone="subdued">{l.name}</Text> : null}
    </BlockStack>,
    <Text as="span" variant="bodySm" key="p">
      {(l.product_titles || []).length ? (l.product_titles || []).slice(0, 3).join(', ') + ((l.product_titles || []).length > 3 ? '…' : '') : '—'}
    </Text>,
    <Badge key="m" tone={MODE_TONE[l.mode] || undefined} size="small">{l.mode || '—'}</Badge>,
    <Text as="span" variant="bodySm" key="c">{l.discount_code || '—'}</Text>,
    l.shopify_customer_id ? <Badge tone="success" size="small" key="s">Synced</Badge> : <Badge size="small" key="s">Local</Badge>,
    <Text as="span" variant="bodySm" tone="subdued" key="d">{shortDate(l.created_at)}</Text>,
  ]);

  return (
    <Page
      title="Leads"
      subtitle="Every email captured by the pop-up, tied to the products that visitor browsed."
      primaryAction={{ content: 'Export CSV', onAction: exportCsv, disabled: !leads.length }}
      secondaryActions={[{ content: 'Pop-up settings', onAction: () => goTo('popups') }]}
    >
      <BlockStack gap="500">
        <InlineGrid columns={{ xs: 1, sm: 2 }} gap="400">
          <Card>
            <BlockStack gap="100">
              <Text as="span" variant="bodySm" tone="subdued">Total leads</Text>
              <Text as="p" variant="heading2xl">{loading ? '—' : stats.total}</Text>
            </BlockStack>
          </Card>
          <Card>
            <BlockStack gap="100">
              <Text as="span" variant="bodySm" tone="subdued">Captured this month</Text>
              <Text as="p" variant="heading2xl">{loading ? '—' : stats.this_month}</Text>
            </BlockStack>
          </Card>
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
            <DataTable
              columnContentTypes={['text', 'text', 'text', 'text', 'text', 'text']}
              headings={['Contact', 'Browsed', 'Reveal', 'Code', 'Shopify', 'Date']}
              rows={tableRows}
            />
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
