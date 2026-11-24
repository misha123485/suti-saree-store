'use client';

import { useMemo } from 'react';
import { Product } from '@/lib/types';
import ProductCarousel from '@/components/product/product-carousel';
import { useTopVariants } from '@/lib/top-variant-api';
import { useFeaturedPicks } from '@/components/featured-picks';
import { markFeaturedClick } from '@/lib/track-api';
import { useCategoryHref } from '@/lib/use-category-href';

/**
 * Scores every candidate against the current product and returns the best
 * matches: same category counts most, shared fabric and shared occasion
 * tags add extra weight, and in-stock items are preferred over out-of-stock
 * ones so "You may also like" doesn't dead-end the shopper.
 */
function scoreCandidate(current: Product, candidate: Product): number {
  let score = 0;
  if (candidate.category === current.category) score += 3;
  if (candidate.fabric && candidate.fabric === current.fabric) score += 2;
  const sharedOccasions = (candidate.occasion || []).filter((o) =>
    (current.occasion || []).includes(o)
  ).length;
  score += sharedOccasions;
  if (candidate.inStock) score += 1;
  return score;
}

export default function RelatedProducts({
  current,
  allProducts,
  limit = 10,
  title = 'You may also like',
  overrideProducts,
  viewAllHref,
}: {
  current: Product;
  allProducts: Product[];
  limit?: number;
  title?: string;
  /** When provided and non-empty, shown instead of the scored same-category
   *  matches below — e.g. the rest of a live "Buy X Get Y" promotion's
   *  collection, so a shopper on that product's page can immediately find
   *  something to pair it with instead of generic related items. */
  overrideProducts?: Product[];
  /** "View All" target when `overrideProducts` is in use (e.g. the BOGO
   *  collection's own page). Falls back to the category shop link below
   *  when not provided. */
  viewAllHref?: string;
}) {
  const scored = useMemo(() => {
    return allProducts
      .filter((p) => p.id !== current.id)
      .map((p) => ({ product: p, score: scoreCandidate(current, p) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score || b.product.rating - a.product.rating)
      .slice(0, limit)
      .map((entry) => entry.product);
  }, [current, allProducts, limit]);

  const usingOverride = !!(overrideProducts && overrideProducts.length > 0);

  // "Similar" me conversion-wale products mix karna (admin toggle 'similar', default OFF):
  // 1 similar -> 1 trending -> 2 similar -> 1 trending -> 2 similar -> 1 trending ...
  // Trending wahi jo isi category me sabse zyada convert karte hain (purchase > checkout > cart > views).
  const sameCategory = useMemo(
    () => allProducts.filter((p) => p.id !== current.id && p.category === current.category),
    [allProducts, current]
  );
  const scoredIds = useMemo(() => scored.map((p) => p.id), [scored]);
  const trending = useFeaturedPicks('similar', sameCategory, { limit: 4, min: 2, excludeIds: scoredIds });

  const { related, highlightIds } = useMemo(() => {
    if (usingOverride) return { related: overrideProducts!.slice(0, limit), highlightIds: undefined };
    if (trending.length === 0) return { related: scored, highlightIds: undefined };
    const gaps = [1, 2]; // pehli baar 1 chhodke, phir har baar 2 chhodke
    const out: Product[] = [];
    let s = 0;
    let t = 0;
    let gapIdx = 0;
    while (out.length < limit && (s < scored.length || t < trending.length)) {
      const gap = gaps[Math.min(gapIdx, gaps.length - 1)];
      for (let i = 0; i < gap && s < scored.length && out.length < limit; i++) out.push(scored[s++]);
      if (t < trending.length && out.length < limit) out.push(trending[t++]);
      gapIdx++;
      if (s >= scored.length && t >= trending.length) break;
    }
    return { related: out, highlightIds: new Set(trending.map((p) => p.id)) };
  }, [usingOverride, overrideProducts, scored, trending, limit]);
  const topVariants = useTopVariants();
  const categoryHref = useCategoryHref();

  return (
    <ProductCarousel
      title={title}
      products={related}
      viewAllHref={viewAllHref ?? categoryHref(current.category)}
      variantOverrides={topVariants}
      highlightIds={highlightIds}
      onProductClick={highlightIds ? (p) => highlightIds.has(p.id) && markFeaturedClick(p.id, 'similar') : undefined}
    />
  );
}
