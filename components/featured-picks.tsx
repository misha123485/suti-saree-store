'use client';

// "Trending Now" strips -- sabse zyada bikne wale / pasand kiye gaye products.
// Ranking CONVERSION-first hai (/api/products/trending, 1 ghante ka cache):
// pichle 30 din me Purchase > Begin checkout > Add to cart > Views, phir lifetime popularity.
// Har jagah admin toggle se ON/OFF hoti hai (default OFF). Data kam ho to kuch nahi dikhta.

import { useEffect, useMemo, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { Product } from '@/lib/types';
import ProductCarousel from '@/components/product/product-carousel';
import ProductCard from '@/components/product-card';
import type { FeaturedFlags, FeaturedPlacement } from '@/lib/featured-placements';
import { markFeaturedClick } from '@/lib/track-api';

const MIN_PICKS = 3; // isse kam products hon to strip chhupa do

let flagsPromise: Promise<FeaturedFlags | null> | null = null;
let rankPromise: Promise<string[]> | null = null;

function loadFlags(): Promise<FeaturedFlags | null> {
  if (!flagsPromise) {
    flagsPromise = fetch('/api/featured-config')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => (j?.flags ?? null) as FeaturedFlags | null)
      .catch(() => null);
  }
  return flagsPromise;
}

function loadRank(): Promise<string[]> {
  if (!rankPromise) {
    rankPromise = fetch('/api/products/trending')
      .then((r) => (r.ok ? r.json() : { ranked: [] }))
      .then((j) => (Array.isArray(j?.ranked) ? (j.ranked as string[]) : []))
      .catch(() => []);
  }
  return rankPromise;
}

export function useFeaturedPicks(
  placement: FeaturedPlacement,
  products: Product[],
  opts: { limit?: number; excludeIds?: string[]; min?: number } = {}
): Product[] {
  const { limit = 8, min = MIN_PICKS } = opts;
  const excludeKey = (opts.excludeIds ?? []).join(',');
  const [ranked, setRanked] = useState<string[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadFlags().then((flags) => {
      if (cancelled || !flags || !flags[placement]) return;
      loadRank().then((r) => {
        if (!cancelled) setRanked(r);
      });
    });
    return () => {
      cancelled = true;
    };
  }, [placement]);

  return useMemo(() => {
    if (!ranked || ranked.length === 0) return [];
    const exclude = new Set(excludeKey ? excludeKey.split(',') : []);
    const byId = new Map(products.map((p) => [p.id, p]));
    const picks: Product[] = [];
    for (const id of ranked) {
      const p = byId.get(id);
      if (!p || exclude.has(id) || p.inStock === false) continue;
      picks.push(p);
      if (picks.length >= limit) break;
    }
    return picks.length >= min ? picks : [];
  }, [ranked, products, limit, min, excludeKey]);
}

/** Home top + Product page ("You may also like" se pehle): normal carousel. */
export function FeaturedCarousel({
  placement,
  products,
  excludeIds,
  title = 'Trending Now',
  eyebrow = 'Customer Favourites',
  limit = 8,
}: {
  placement: FeaturedPlacement;
  products: Product[];
  excludeIds?: string[];
  title?: string;
  eyebrow?: string;
  limit?: number;
}) {
  const picks = useFeaturedPicks(placement, products, { limit, excludeIds });
  if (picks.length === 0) return null;
  return (
    <ProductCarousel
      eyebrow={eyebrow}
      title={title}
      products={picks}
      viewAllHref="/shop"
      onProductClick={(p) => markFeaturedClick(p.id, placement)}
    />
  );
}

/** Shop / Category grid ke bich (3 products ke baad): poori row wala highlighted box. */
export function FeaturedHighlight({
  placement,
  products,
  excludeIds,
  limit = 4,
}: {
  placement: FeaturedPlacement;
  products: Product[];
  excludeIds?: string[];
  limit?: number;
}) {
  const picks = useFeaturedPicks(placement, products, { limit, excludeIds });
  if (picks.length === 0) return null;
  return (
    <div className="col-span-full rounded-2xl border border-secondary/40 bg-secondary/10 p-3 sm:p-5">
      <div className="mb-3 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-secondary" />
        <h3 className="font-serif text-lg font-bold text-primary sm:text-xl">Customer Favourites</h3>
        <span className="rounded-full bg-secondary/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
          Trending
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
        {picks.map((p) => (
          <div key={`fav-${p.id}`} onClickCapture={() => markFeaturedClick(p.id, placement)}>
            <ProductCard product={p} disableAutoplayVideo />
          </div>
        ))}
      </div>
    </div>
  );
}
