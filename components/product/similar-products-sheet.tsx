'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import Link from 'next/link';
import { Check, ChevronLeft, ChevronRight, ShoppingBag, Star, X } from 'lucide-react';
import { Product } from '@/lib/types';
import { formatINR, discountPct } from '@/lib/format';
import { useCart } from '@/lib/cart-context';
import SizePickerSheet from '@/components/product/size-picker-sheet';
import { useTopVariants } from '@/lib/top-variant-api';
import { toPublicMediaUrl } from '@/lib/media-url';

/** Same idea as RelatedProducts: category counts most, then fabric, shared
 *  occasions, a similar price band, and in-stock items first. */
function scoreCandidate(current: Product, c: Product): number {
  let score = 0;
  if (c.category === current.category) score += 3;
  if (c.fabric && c.fabric === current.fabric) score += 2;
  score += (c.occasion || []).filter((o) => (current.occasion || []).includes(o)).length;
  if (current.price > 0 && Math.abs(c.price - current.price) / current.price <= 0.35) score += 1;
  if (c.inStock) score += 1;
  return score;
}

function ratingTone(v: number) {
  return v >= 3.5 ? 'fill-emerald-600 text-emerald-600' : v >= 2.5 ? 'fill-amber-500 text-amber-500' : 'fill-red-500 text-red-500';
}

/** "Similar Products" popup: bottom sheet on mobile, centred panel on desktop. */
export default function SimilarProductsSheet({
  current,
  allProducts,
  onClose,
}: {
  current: Product;
  allProducts: Product[];
  onClose: () => void;
}) {
  const { addItem, items: cartItems } = useCart();
  const [sizeFor, setSizeFor] = useState<Product | null>(null);
  const topVariants = useTopVariants();
  const [shown, setShown] = useState(false);
  const [dragY, setDragY] = useState(0);
  const dragStart = useRef<number | null>(null);
  const strip = useRef<HTMLDivElement | null>(null);

  const similar = useMemo(
    () =>
      allProducts
        .filter((p) => p.id !== current.id && (p.images?.length ?? 0) > 0)
        .map((p) => ({ p, score: scoreCandidate(current, p) }))
        .filter((e) => e.score > 0)
        .sort((a, b) => b.score - a.score || (b.p.rating ?? 0) - (a.p.rating ?? 0))
        .slice(0, 12)
        .map((e) => e.p),
    [allProducts, current]
  );

  const close = () => {
    setShown(false);
    window.setTimeout(onClose, 220);
  };

  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true));
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(id);
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isMobile = () => window.innerWidth < 1024;
  const scrollBy = (dir: -1 | 1) => {
    const el = strip.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: 'smooth' });
  };

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center lg:items-center lg:p-6" role="dialog" aria-modal="true" aria-label="Similar products">
      <div
        className={`absolute inset-0 bg-black/55 transition-opacity duration-200 ${shown ? 'opacity-100' : 'opacity-0'}`}
        onClick={close}
      />

      <div
        className={`relative flex max-h-[88dvh] w-full flex-col overflow-hidden rounded-t-3xl bg-background shadow-2xl lg:max-w-5xl lg:rounded-3xl ${
          dragY ? '' : 'transition-all duration-200 ease-out'
        } ${shown ? 'translate-y-0 opacity-100 lg:scale-100' : 'translate-y-full opacity-0 lg:translate-y-4 lg:scale-95'}`}
        style={dragY ? { transform: `translateY(${dragY}px)` } : undefined}
      >
        <div
          className="shrink-0"
          onTouchStart={(e) => {
            if (isMobile()) dragStart.current = e.touches[0].clientY;
          }}
          onTouchMove={(e) => {
            if (dragStart.current !== null) setDragY(Math.max(0, e.touches[0].clientY - dragStart.current));
          }}
          onTouchEnd={() => {
            if (dragStart.current === null) return;
            const dy = dragY;
            dragStart.current = null;
            setDragY(0);
            if (dy > 110) close();
          }}
        >
          <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-muted-foreground/30 lg:hidden" />
          <div className="flex items-center justify-between px-4 py-3 lg:px-6 lg:py-4">
            <h2 className="font-serif text-lg font-bold text-foreground">Similar Products</h2>
            <button
              type="button"
              onClick={close}
              aria-label="Close similar products"
              className="rounded-full p-1.5 text-foreground/70 transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain pb-5">
          {similar.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">No similar products found right now.</p>
          ) : (
            <>
              <div
                ref={strip}
                className="flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 lg:px-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                {similar.map((p) => {
                  const top = topVariants[p.id];
                  const slug = top?.slug || p.slug;
                  const img = toPublicMediaUrl(top?.image || p.images[0]) || p.images[0];
                  const discount = discountPct(p.price, p.mrp);
                  const inStock = p.default_variant_in_stock ?? p.inStock;
                  const rating = p.rating ?? 0;
                  return (
                    <article
                      key={p.id}
                      className="flex w-[46%] min-w-[160px] shrink-0 snap-start flex-col overflow-hidden rounded-2xl border border-border/60 bg-card sm:w-[30%] lg:w-[220px]"
                    >
                      <Link href={`/product/${slug}`} onClick={close} className="relative block aspect-[3/4] bg-muted">
                        <Image
                          src={img}
                          alt={p.name}
                          fill
                          sizes="(min-width: 1024px) 220px, 46vw"
                          className="object-cover"
                        />
                        {rating > 0 && (
                          <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-md bg-background/95 px-1.5 py-0.5 text-[11px] font-semibold text-foreground shadow-sm">
                            {rating.toFixed(1)}
                            <Star className={`h-3 w-3 ${ratingTone(rating)}`} />
                          </span>
                        )}
                        {!inStock && (
                          <span className="absolute inset-x-0 top-0 bg-foreground/80 py-1 text-center text-[11px] font-semibold text-background">
                            Out of stock
                          </span>
                        )}
                      </Link>

                      <div className="flex flex-1 flex-col gap-2 p-3">
                        <Link href={`/product/${slug}`} onClick={close} className="min-w-0">
                          <p className="line-clamp-2 text-sm font-semibold leading-snug text-foreground">{p.name}</p>
                          {p.fabric && <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{p.fabric}</p>}
                        </Link>
                        <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                          <span className="text-base font-bold text-foreground">{formatINR(p.price)}</span>
                          {discount > 0 && p.mrp && (
                            <>
                              <span className="text-xs text-muted-foreground line-through">{formatINR(p.mrp)}</span>
                              <span className="text-xs font-semibold text-emerald-600">{discount}% OFF</span>
                            </>
                          )}
                        </div>
                        {inStock ? (
                          <button
                            type="button"
                            onClick={() => (p.sizes.length > 0 ? setSizeFor(p) : close())}
                            className={`mt-auto inline-flex w-full items-center justify-center gap-1.5 rounded-lg border py-2 text-sm font-semibold transition-colors active:scale-[0.98] ${
                              cartItems.some((i) => i.product.id === p.id)
                                ? 'border-emerald-600/50 bg-emerald-50 text-emerald-700'
                                : 'border-primary/60 text-primary hover:bg-primary/5'
                            }`}
                          >
                            {cartItems.some((i) => i.product.id === p.id) ? <Check className="h-4 w-4" /> : <ShoppingBag className="h-4 w-4" />}
                            {cartItems.some((i) => i.product.id === p.id) ? 'Added to Bag' : 'Add to Bag'}
                          </button>
                        ) : (
                          <Link
                            href={`/product/${slug}`}
                            onClick={close}
                            className="mt-auto inline-flex w-full items-center justify-center rounded-lg border border-border py-2 text-sm font-semibold text-muted-foreground"
                          >
                            View product
                          </Link>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>

              {similar.length > 4 && (
                <>
                  <button
                    type="button"
                    aria-label="Scroll left"
                    onClick={() => scrollBy(-1)}
                    className="absolute left-2 top-1/3 hidden rounded-full bg-background/95 p-2 shadow-md hover:bg-background lg:block"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    aria-label="Scroll right"
                    onClick={() => scrollBy(1)}
                    className="absolute right-2 top-1/3 hidden rounded-full bg-background/95 p-2 shadow-md hover:bg-background lg:block"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>
      {sizeFor && (
        <SizePickerSheet
          name={sizeFor.name}
          image={toPublicMediaUrl(topVariants[sizeFor.id]?.image || sizeFor.images[0]) || sizeFor.images[0]}
          price={sizeFor.price}
          mrp={sizeFor.mrp}
          sizes={sizeFor.sizes}
          onDone={(size) => addItem(sizeFor, size, 1)}
          onClose={() => setSizeFor(null)}
        />
      )}
    </div>,
    document.body
  );
}
