import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { getServerSupabase } from '@/lib/supabase-server';
import { fetchProductsServer } from '@/lib/products-api-server';
import {
  buildProductSkus,
  buildReviewsFeedXml,
  type FeedReview,
  type FeedVariantForSkus,
} from '@/lib/product-reviews-feed';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.sutisaree.com';

// Google Merchant Center "Product reviews" feed (XML, schema v2.3).
//
// Add this URL in Merchant Center -> Data sources -> Product review sources
// -> Add product reviews -> "Add product reviews from a file" ->
// "Enter a link to your file":
//   https://www.sutisaree.com/api/product-reviews-feed
//
// Only APPROVED, REAL reviews with a valid 1-5 rating and some text are included.
// All XML building / sanitising / PII stripping lives in lib/product-reviews-feed.ts (unit-tested).
// Each review is linked to its product through <skus> = the same ids the product feed
// (/api/merchant-feed) uses as <g:id> (+ the product id = <g:item_group_id>) and <brands> = the
// same brand as <g:brand>. A review whose product has no resolvable id is skipped, never emitted.
export const dynamic = 'force-dynamic';

const PAGE = 1000; // Supabase/PostgREST returns max 1000 rows per request
const ID_CHUNK = 100; // keeps the `.in()` query string short

export async function GET() {
  const admin = getSupabaseAdmin();

  const reviewRows: FeedReview[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from('reviews')
      .select('id, product_id, customer_name, rating, title, comment, created_at')
      .eq('is_approved', true)
      .order('created_at', { ascending: false })
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) {
      return new NextResponse(`Failed to load reviews: ${error.message}`, { status: 500 });
    }
    const rows = (data ?? []) as unknown as FeedReview[];
    reviewRows.push(...rows);
    if (rows.length < PAGE || reviewRows.length >= 20000) break;
  }

  const supabase = getServerSupabase();
  const { data: settingsRow } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'marketing_settings')
    .maybeSingle();
  // Same brand the product feed sends as <g:brand>.
  const brand =
    ((settingsRow?.value as { merchant_feed_brand?: string } | null)?.merchant_feed_brand || '').trim() || 'Sutisaree';

  const products = await fetchProductsServer();
  const productById = new Map(products.map((p) => [p.id, { id: p.id, slug: p.slug, name: p.name }]));
  const productIds = Array.from(new Set(reviewRows.map((r) => r.product_id))).filter((id) => productById.has(id));

  // Same ids as /api/merchant-feed uses for <g:id> -- see buildProductSkus().
  const variantsByProduct = new Map<string, FeedVariantForSkus[]>();
  for (let i = 0; i < productIds.length; i += ID_CHUNK) {
    const chunk = productIds.slice(i, i + ID_CHUNK);
    const { data: variants, error: vErr } = await supabase
      .from('product_variants')
      .select('id, product_id, product_variant_sizes(size)')
      .in('product_id', chunk);
    if (vErr) {
      return new NextResponse(`Failed to load variants: ${vErr.message}`, { status: 500 });
    }
    for (const v of (variants ?? []) as unknown as FeedVariantForSkus[]) {
      const list = variantsByProduct.get(v.product_id) ?? [];
      list.push(v);
      variantsByProduct.set(v.product_id, list);
    }
  }

  const skusByProduct = new Map<string, string[]>();
  for (const id of productIds) skusByProduct.set(id, buildProductSkus(id, variantsByProduct.get(id)));

  const { xml, total, included, skipped } = buildReviewsFeedXml({
    reviews: reviewRows,
    productsById: productById,
    skusByProduct,
    brand,
    siteUrl: SITE_URL,
    publisherName: 'Sutisaree',
  });

  return new NextResponse(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=300, stale-while-revalidate=60',
      // handy when debugging in the browser's Network tab
      'X-Reviews-Included': String(included),
      'X-Reviews-Skipped': String(total - included),
      'X-Reviews-Skip-Reasons': Object.entries(skipped).filter(([, n]) => n > 0).map(([k, n]) => `${k}=${n}`).join(',') || 'none',
    },
  });
}
