import { NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { computePopularityRanking } from '@/lib/popularity-core';

/**
 * GET /api/products/popularity -> { ranked: string[] }
 * Product ids, most popular first: lifetime units sold (old WooCommerce site
 * + new site) first, then last-30-day views/purchases/checkouts/add-to-carts
 * as tie-breaks. Products with no data are appended by the caller.
 * Mirrors lib/popularity-rank-server.ts (same cache key).
 */
export const revalidate = 3600;

const cachedRanking = unstable_cache(computePopularityRanking, ['popularity-ranking-v2'], { revalidate: 3600 });

export async function GET() {
  try {
    return NextResponse.json({ ranked: await cachedRanking() });
  } catch (err) {
    console.error('[popularity] error', err);
    return NextResponse.json({ ranked: [] });
  }
}
