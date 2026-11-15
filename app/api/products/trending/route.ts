import { NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { computeTrendingRanking, loadTrendingConfig } from '@/lib/trending-core';
import { TrendingConfig } from '@/lib/trending-config';

/**
 * GET /api/products/trending -> { ranked: string[] }
 * Product ids, admin ke chune hue signals (Purchase > Begin checkout > Add to cart > Views)
 * aur date ke baad se, phir lifetime popularity.
 * Config cache key me hai, to toggle/date badalte hi naya ranking banta hai; baaki 1 ghante cache.
 */
export const dynamic = 'force-dynamic';

const cachedRanking = unstable_cache(
  async (cfgKey: string) => computeTrendingRanking(JSON.parse(cfgKey) as TrendingConfig),
  ['trending-ranking-v2'],
  { revalidate: 3600 }
);

export async function GET() {
  try {
    const cfg = await loadTrendingConfig();
    const ranked = await cachedRanking(JSON.stringify(cfg));
    return NextResponse.json({ ranked }, { headers: { 'cache-control': 'public, s-maxage=60, stale-while-revalidate=300' } });
  } catch (err) {
    console.error('[trending] error', err);
    return NextResponse.json({ ranked: [] });
  }
}
