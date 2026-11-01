import 'server-only';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

/**
 * Shop "Popularity" order — same idea as the old WooCommerce site, where
 * popularity = total units SOLD (lifetime). Ranking rule, strict priority:
 *
 *   1. Lifetime units sold = old-site (legacy WooCommerce) orders
 *                          + new-site orders (cancelled/failed ignored)
 *   2. Last-30-day Impressions (product_view)   -- tie-break
 *   3. Last-30-day Purchase / Begin checkout / Add to cart -- further tie-breaks
 *
 * Returns product ids, most popular first. Products with no data are not
 * included; callers append them at the end. Never throws.
 */

const PAGE = 1000;
const DEAD_STATUSES = new Set([
  'wc-cancelled', 'cancelled', 'wc-failed', 'failed', 'wc-refunded', 'refunded',
  'wc-trash', 'trash', 'draft', 'wc-checkout-draft', 'auto-draft', 'pending_payment',
]);

async function fetchAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

/** product uuid -> lifetime units sold (old site + new site). */
async function loadLifetimeSales(supabase: ReturnType<typeof getSupabaseAdmin>): Promise<Map<string, number>> {
  const sold = new Map<string, number>();
  const add = (id: string, n: number) => sold.set(id, (sold.get(id) ?? 0) + n);

  // ---- New site orders ----
  try {
    const rows = await fetchAll<any>((f, t) =>
      supabase.from('order_items').select('product_id, quantity, orders!inner(status)').not('product_id', 'is', null).range(f, t)
    );
    for (const r of rows) {
      const st = String(r.orders?.status ?? '').toLowerCase();
      if (DEAD_STATUSES.has(st) || st === 'cancelled' || st === 'failed') continue;
      add(String(r.product_id), Number(r.quantity) || 0);
    }
  } catch (e) {
    console.error('[popularity] new orders failed', e);
  }

  // ---- Old site (WooCommerce) orders ----
  try {
    const { data: mrow } = await supabase.from('settings').select('value').eq('key', 'feed_idmap').maybeSingle();
    const parents: Record<string, unknown> = ((mrow as any)?.value ?? {}).parents ?? {};
    const slugByOldId = new Map<string, string>();
    for (const [slug, oldId] of Object.entries(parents)) {
      const k = String(oldId ?? '').trim();
      if (k && !slugByOldId.has(k)) slugByOldId.set(k, slug);
    }
    if (slugByOldId.size > 0) {
      const prods = await fetchAll<any>((f, t) => supabase.from('products').select('id, slug').range(f, t));
      const idBySlug = new Map(prods.map((p: any) => [String(p.slug), String(p.id)]));

      const orders = await fetchAll<any>((f, t) =>
        supabase.from('legacy_wc_orders').select('id, status, type').eq('type', 'shop_order').range(f, t)
      );
      const okOrder = new Set<number>();
      for (const o of orders) if (!DEAD_STATUSES.has(String(o.status ?? '').toLowerCase())) okOrder.add(Number(o.id));

      const items = await fetchAll<any>((f, t) =>
        supabase.from('legacy_wc_order_items').select('order_item_id, order_id').eq('order_item_type', 'line_item').range(f, t)
      );
      const orderByItem = new Map<number, number>();
      for (const it of items) if (okOrder.has(Number(it.order_id))) orderByItem.set(Number(it.order_item_id), Number(it.order_id));

      const meta = await fetchAll<any>((f, t) =>
        supabase.from('legacy_wc_order_itemmeta').select('order_item_id, meta_key, meta_value').in('meta_key', ['_product_id', '_qty']).range(f, t)
      );
      const pid = new Map<number, string>();
      const qty = new Map<number, number>();
      for (const m of meta) {
        const k = Number(m.order_item_id);
        if (!orderByItem.has(k)) continue;
        if (m.meta_key === '_product_id') pid.set(k, String(m.meta_value ?? '').trim());
        else qty.set(k, Number(m.meta_value) || 0);
      }
      pid.forEach((oldId, itemId) => {
        const slug = slugByOldId.get(oldId);
        const uuid = slug ? idBySlug.get(slug) : undefined;
        if (uuid) add(uuid, qty.get(itemId) ?? 1);
      });
    }
  } catch (e) {
    console.error('[popularity] legacy orders failed', e);
  }

  return sold;
}

export async function computePopularityRanking(): Promise<string[]> {
  try {
    const supabase = getSupabaseAdmin();
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const [sold, ev] = await Promise.all([
      loadLifetimeSales(supabase),
      supabase
        .from('activity_events')
        .select('product_id, event_type')
        .in('event_type', ['purchase', 'checkout_start', 'add_to_cart', 'product_view'])
        .gte('created_at', since)
        .not('product_id', 'is', null),
    ]);

    type C = { sold: number; view: number; purchase: number; checkout: number; cart: number };
    const m = new Map<string, C>();
    const get = (id: string) => {
      let c = m.get(id);
      if (!c) m.set(id, (c = { sold: 0, view: 0, purchase: 0, checkout: 0, cart: 0 }));
      return c;
    };
    sold.forEach((n, id) => { get(id).sold = n; });
    for (const r of ev.data ?? []) {
      if (!r.product_id) continue;
      const c = get(String(r.product_id));
      if (r.event_type === 'product_view') c.view++;
      else if (r.event_type === 'purchase') c.purchase++;
      else if (r.event_type === 'checkout_start') c.checkout++;
      else if (r.event_type === 'add_to_cart') c.cart++;
    }

    return Array.from(m.entries())
      .sort(([, a], [, b]) =>
        b.sold - a.sold || b.view - a.view || b.purchase - a.purchase || b.checkout - a.checkout || b.cart - a.cart
      )
      .map(([id]) => id);
  } catch (err) {
    console.error('[popularity] compute failed', err);
    return [];
  }
}
