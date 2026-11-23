// Server-side data for the Product JSON-LD (see lib/product-jsonld.ts and app/product/[slug]/product-page-body.tsx).
//
// Reviews come straight from the `reviews` table (is_approved = true, rating 1-5) -- NOT from the
// products.rating / products.reviews columns, which can be stale. Any failure returns [] so the page
// simply publishes no rating (never a fake one).
import { getServerSupabase } from './supabase-server';
import type { JsonLdReviewRow } from './product-jsonld';

const PAGE = 1000;

/** All approved, validly rated reviews of one product (all colours), newest first. */
export async function fetchApprovedReviewsForSchema(productId: string): Promise<JsonLdReviewRow[]> {
  try {
    const supabase = getServerSupabase();
    const rows: JsonLdReviewRow[] = [];
    for (let from = 0; from < 20000; from += PAGE) {
      const { data, error } = await supabase
        .from('reviews')
        .select('customer_name, rating, title, comment, created_at, is_approved')
        .eq('product_id', productId)
        .eq('is_approved', true)
        .gte('rating', 1)
        .lte('rating', 5)
        .order('created_at', { ascending: false })
        .range(from, from + PAGE - 1);
      if (error) return [];
      const batch = (data ?? []) as unknown as JsonLdReviewRow[];
      rows.push(...batch);
      if (batch.length < PAGE) break;
    }
    return rows;
  } catch {
    return [];
  }
}

/** Same brand the product feed sends as <g:brand> (marketing_settings.merchant_feed_brand, default "Sutisaree"). */
export async function fetchFeedBrand(): Promise<string> {
  try {
    const supabase = getServerSupabase();
    const { data } = await supabase.from('settings').select('value').eq('key', 'marketing_settings').maybeSingle();
    const brand = ((data?.value as { merchant_feed_brand?: string } | null)?.merchant_feed_brand || '').trim();
    return brand || 'Sutisaree';
  } catch {
    return 'Sutisaree';
  }
}
