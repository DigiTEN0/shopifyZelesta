// Registers / removes the storefront widget ScriptTag on a shop.
import config from '../config/index.js';
import { getClient, setScriptTagId, getShop } from './shopsService.js';

function widgetSrc() {
  // Cache-bust on deploy so merchants always get the latest widget.
  return `${config.appUrl}/widget/widget.js`;
}

export async function ensureScriptTag(shop) {
  const client = await getClient(shop);
  if (!client) throw new Error(`No access token for ${shop}`);

  const src = widgetSrc();

  // Avoid duplicates: look for an existing tag pointing at our widget.
  const existing = await client.get('/script_tags.json');
  const ours = (existing.script_tags || []).find(
    (t) => t.src && t.src.startsWith(`${config.appUrl}/widget/widget.js`)
  );
  if (ours) {
    await setScriptTagId(shop, ours.id);
    return ours;
  }

  const created = await client.post('/script_tags.json', {
    script_tag: { event: 'onload', src, display_scope: 'online_store' },
  });
  const tag = created.script_tag;
  await setScriptTagId(shop, tag.id);
  return tag;
}

export async function removeScriptTag(shop) {
  const client = await getClient(shop);
  if (!client) return;
  const row = await getShop(shop);
  if (row?.script_tag_id) {
    try {
      await client.delete(`/script_tags/${row.script_tag_id}.json`);
    } catch (err) {
      // Already gone — ignore.
      if (err.status !== 404) throw err;
    }
  }
}
