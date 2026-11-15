import 'server-only';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { fetchCapped } from '@/lib/fetch-capped';
import { fetchPopularityRankServer } from '@/lib/popularity-rank-server';
import {
  TRENDING_CONFIG_KEY,
  TrendingConfig,
  normalizeTrendingConfig,
  trendingSinceISO,
} from '@/lib/trending-config';

/**
 * "Trending Now" ranking -- CONVERSION first (admin ki chuni date ke baad se, default pichle 30 din;
 * admin har signal (purchase / checkout / cart / views) alag ON/OFF kar sakta hai):
 *   1. Purchase (orders)            sabse zyada
 *   2. Begin checkout               tie-break
 *   3. Add to cart                  tie-break
 *   4. Product views                tie-break
 * (strict priority: 1 purchase wala product, 50 carts wale se upar). Count = alag-alag
 * sessions, taaki ek banda 10 baar click kare to 10 na gine.
 * Jinka koi data nahi, wo lifetime-popularity order me peeche jodte hain, taaki
 * strip ke liye hamesha kaafi products mil sakein. Kabhi throw nahi karta.
 */
const DEAD_ORDER_STATUSES = new Set(['cancelled', 'failed', 'refunded', 'wc-cancelled', 'wc-failed', 'wc-refunded']);

/** Admin ka saved config (table na ho / error ho to default). */
export async function loadTrendingConfig(): Promise<TrendingConfig> {
  try {
    const { data } = await getSupabaseAdmin()
      .from('tracking_settings')
      .select('value')
      .eq('key', TRENDING_CONFIG_KEY)
      .maybeSingle();
    return normalizeTrendingConfig(data?.value);
  } catch {
    return normalizeTrendingConfig(null);
  }
}

export async function computeTrendingRanking(cfg: TrendingConfig = normalizeTrendingConfig(null)): Promise<string[]> {
  try {
    const supabase = getSupabaseAdmin();
    const since = trendingSinceISO(cfg);
    const eventTypes = [
      cfg.view && 'product_view',
      cfg.cart && 'add_to_cart',
      cfg.checkout && 'checkout_start',
    ].filter(Boolean) as string[];

    const [events, orders, popularity] = await Promise.all([
      eventTypes.length === 0
        ? Promise.resolve([] as { product_id: string | null; event_type: string; session_id: string | null }[])
        : fetchCapped<{ product_id: string | null; event_type: string; session_id: string | null }>((a, b) =>
        supabase
          .from('activity_events')
          .select('product_id, event_type, session_id')
          .in('event_type', eventTypes)
          .not('product_id', 'is', null)
          .gte('created_at', since)
          .order('created_at', { ascending: false })
          .range(a, b)
      ),
      !cfg.purchase
        ? Promise.resolve([] as { items: any; status: string | null }[])
        : fetchCapped<{ items: any; status: string | null }>(
        (a, b) =>
          supabase
            .from('orders')
            .select('items, status')
            .gte('created_at', since)
            .order('created_at', { ascending: false })
            .range(a, b),
        5000
      ),
      fetchPopularityRankServer(),
    ]);

    type C = { purchase: number; checkout: number; cart: number; view: number };
    const stats = new Map<string, C>();
    const get = (id: string): C => {
      let c = stats.get(id);
      if (!c) stats.set(id, (c = { purchase: 0, checkout: 0, cart: 0, view: 0 }));
      return c;
    };

    // distinct session per (product, type)
    const seen = new Set<string>();
    for (const e of events) {
      if (!e.product_id) continue;
      const k = `${e.product_id}|${e.event_type}|${e.session_id ?? Math.random()}`;
      if (seen.has(k)) continue;
      seen.add(k);
      const c = get(e.product_id);
      if (e.event_type === 'product_view') c.view++;
      else if (e.event_type === 'add_to_cart') c.cart++;
      else if (e.event_type === 'checkout_start') c.checkout++;
    }

    for (const o of orders) {
      if (DEAD_ORDER_STATUSES.has(String(o.status ?? '').toLowerCase())) continue;
      const items = Array.isArray(o.items) ? o.items : [];
      const once = new Set<string>();
      for (const it of items) {
        const id = it?.product_id ? String(it.product_id) : '';
        if (!id || once.has(id)) continue;
        once.add(id);
        get(id).purchase++;
      }
    }

    const byConversion = Array.from(stats.entries())
      .sort(
        ([, a], [, b]) => b.purchase - a.purchase || b.checkout - a.checkout || b.cart - a.cart || b.view - a.view
      )
      .map(([id]) => id);

    // baaki products lifetime popularity ke order me
    const rest = Array.from(popularity.entries())
      .sort((a, b) => a[1] - b[1])
      .map(([id]) => id)
      .filter((id) => !stats.has(id));

    return [...byConversion, ...rest];
  } catch (err) {
    console.error('[trending] compute failed', err);
    return [];
  }
}
