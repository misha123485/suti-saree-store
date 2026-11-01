/**
 * Server-side popularity ranking, passed to the shop/category pages so the
 * first paint is already in the right order.
 *
 * Rule (same as the old WooCommerce site): lifetime units SOLD first (old
 * site + new site orders), then last-30-day views/purchases as tie-breaks.
 * See lib/popularity-core.ts.
 */
import { unstable_cache } from 'next/cache';
import { computePopularityRanking } from '@/lib/popularity-core';

const cachedRanking = unstable_cache(computePopularityRanking, ['popularity-ranking-v2'], { revalidate: 3600 });

export async function fetchPopularityRankServer(): Promise<Map<string, number>> {
  try {
    const ranked = await cachedRanking();
    return new Map(ranked.map((id, i) => [id, i]));
  } catch (err) {
    console.error('[fetchPopularityRankServer] error', err);
    return new Map();
  }
}
