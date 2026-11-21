'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Star, X, BadgeCheck } from 'lucide-react';
import { getSupabaseBrowser } from '@/lib/supabase-browser';
import { fetchReviewDisplaySettings } from '@/lib/reviews-api';

/**
 * Floating maroon "Reviews" tab on the right edge of the storefront.
 *
 *  - Product page: opens that product's own reviews popup
 *    (components/product/reviews-section.tsx listens for the event below).
 *  - Everywhere else: opens a store-wide popup with the latest reviews.
 *  - Never shown on cart, checkout, the Shopping Bag drawer, admin or vendor
 *    pages.
 *  - Switch on/off in Admin > Reviews > Display settings
 *    ("Show floating Reviews badge"). Takes effect on the next page load.
 */
const HIDDEN_PREFIXES = ['/admin', '/vendor', '/checkout', '/cart', '/cart-link', '/confirm-order', '/review'];
const PAGE_SIZE = 20;

interface StoreReview {
  id: string;
  customer_name: string;
  rating: number;
  title: string | null;
  comment: string | null;
  photos: string[] | null;
  verified_purchase: boolean;
  created_at: string;
}

interface StoreStats {
  total: number;
  average: number;
  counts: Record<number, number>;
}

let cachedEnabled: boolean | null = null;

function Stars({ value, className = 'h-4 w-4' }: { value: number; className?: string }) {
  return (
    <span className="inline-flex gap-0.5" aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={`${className} ${n <= Math.round(value) ? 'fill-secondary text-secondary' : 'text-border'}`}
        />
      ))}
    </span>
  );
}

function StorePopup({ onClose }: { onClose: () => void }) {
  const [stats, setStats] = useState<StoreStats | null>(null);
  const [reviews, setReviews] = useState<StoreReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [onlyPhotos, setOnlyPhotos] = useState(false);

  // Exact star counts (5 light count-only queries), once per open.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = getSupabaseBrowser();
        const results = await Promise.all(
          [5, 4, 3, 2, 1].map((star) =>
            supabase
              .from('reviews')
              .select('id', { count: 'exact', head: true })
              .eq('is_approved', true)
              .eq('rating', star)
          )
        );
        const counts: Record<number, number> = {};
        let total = 0;
        let sum = 0;
        [5, 4, 3, 2, 1].forEach((star, i) => {
          const c = results[i].count ?? 0;
          counts[star] = c;
          total += c;
          sum += c * star;
        });
        if (!cancelled) setStats({ total, average: total ? Math.round((sum / total) * 10) / 10 : 0, counts });
      } catch {
        /* stats are optional */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Review list (latest first, only ones with something to read or see).
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const supabase = getSupabaseBrowser();
        let q = supabase
          .from('reviews')
          .select('id, customer_name, rating, title, comment, photos, verified_purchase, created_at')
          .eq('is_approved', true)
          .order('created_at', { ascending: false })
          .limit(limit);
        if (onlyPhotos) q = q.not('photos', 'eq', '{}');
        const { data, error } = await q;
        if (error) throw error;
        if (!cancelled) {
          setReviews(((data ?? []) as StoreReview[]).map((r) => ({ ...r, photos: r.photos ?? [] })));
          setFailed(false);
        }
      } catch {
        if (!cancelled) setFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [limit, onlyPhotos]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const visible = reviews.filter((r) => (r.comment?.trim() || r.title?.trim() || (r.photos?.length ?? 0) > 0));
  const canLoadMore = !loading && reviews.length >= limit && (!stats || limit < stats.total);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-foreground/50 backdrop-blur-[2px] sm:items-center"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Customer reviews"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-t-3xl bg-background shadow-2xl sm:rounded-3xl"
      >
        <div className="flex items-center justify-between border-b border-border/70 px-5 py-4">
          <h2 className="font-serif text-xl font-semibold text-primary">Customer reviews</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close reviews"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-col gap-5 overflow-y-auto px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] pt-5">
          {stats && stats.total > 0 && (
            <div className="grid grid-cols-[auto_1fr] items-center gap-5">
              <div className="flex flex-col items-start gap-1.5">
                <span className="font-serif text-5xl font-bold leading-none text-primary">{stats.average.toFixed(1)}</span>
                <Stars value={stats.average} />
                <span className="text-xs text-muted-foreground">{stats.total.toLocaleString('en-IN')} reviews</span>
              </div>
              <div className="flex flex-col gap-1.5">
                {[5, 4, 3, 2, 1].map((star) => (
                  <div key={star} className="grid grid-cols-[2rem_1fr_2.5rem] items-center gap-2 text-xs text-muted-foreground">
                    <span>{star} ★</span>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-secondary to-primary"
                        style={{ width: `${(stats.counts[star] / stats.total) * 100}%` }}
                      />
                    </div>
                    <span className="text-right">{stats.counts[star].toLocaleString('en-IN')}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button
            type="button"
            aria-pressed={onlyPhotos}
            onClick={() => {
              setOnlyPhotos((v) => !v);
              setLimit(PAGE_SIZE);
            }}
            className={`w-fit rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors ${
              onlyPhotos ? 'border-secondary bg-accent text-primary' : 'border-border bg-card text-foreground/80'
            }`}
          >
            With photos
          </button>

          {failed && <p className="py-6 text-center text-sm text-muted-foreground">Reviews could not be loaded. Please try again.</p>}
          {loading && visible.length === 0 && !failed && (
            <p className="py-6 text-center text-sm text-muted-foreground">Loading reviews…</p>
          )}
          {!loading && !failed && visible.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">No reviews to show yet.</p>
          )}

          <ul className="flex flex-col">
            {visible.map((r) => (
              <li key={r.id} className="flex flex-col gap-2 border-t border-border/70 py-4 first:border-t-0 first:pt-0">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-primary">
                      {(r.customer_name || '?').trim().charAt(0).toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{r.customer_name}</p>
                      {r.verified_purchase && (
                        <p className="flex items-center gap-1 text-xs font-medium text-emerald-700">
                          <BadgeCheck className="h-3.5 w-3.5" /> Verified buyer
                        </p>
                      )}
                    </div>
                  </div>
                  <Stars value={r.rating} />
                </div>
                {r.title && <p className="text-sm font-semibold">{r.title}</p>}
                {r.comment && <p className="whitespace-pre-line break-words text-sm leading-relaxed text-foreground/85">{r.comment}</p>}
                {(r.photos?.length ?? 0) > 0 && (
                  <div className="flex gap-2 overflow-x-auto">
                    {r.photos!.slice(0, 4).map((src, i) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={i}
                        src={src}
                        alt={`Photo from ${r.customer_name}'s review`}
                        loading="lazy"
                        className="h-24 w-20 shrink-0 rounded-xl border border-border/60 object-cover"
                      />
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>

          {canLoadMore && (
            <button
              type="button"
              onClick={() => setLimit((l) => l + PAGE_SIZE)}
              className="mx-auto rounded-full border border-primary px-6 py-2.5 text-sm font-medium text-primary"
            >
              Load more reviews
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ReviewsBadge() {
  const pathname = usePathname() || '';
  const [enabled, setEnabled] = useState<boolean>(cachedEnabled ?? false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (cachedEnabled !== null) return;
    let cancelled = false;
    fetchReviewDisplaySettings().then((st) => {
      cachedEnabled = st.showFloatingBadge;
      if (!cancelled) setEnabled(st.showFloatingBadge);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Close the popup when the shopper navigates.
  useEffect(() => setOpen(false), [pathname]);

  const close = useCallback(() => setOpen(false), []);

  const hidden = HIDDEN_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (!enabled || hidden) return null;

  const onProductPage = pathname.startsWith('/product/');
  const handleClick = () => {
    if (onProductPage) window.dispatchEvent(new Event('open-reviews-sheet'));
    else setOpen(true);
  };

  return (
    <>
      {/* `cart-drawer-open` is toggled on <body> by components/cart-drawer.tsx */}
      <button
        type="button"
        onClick={handleClick}
        aria-label="Open customer reviews"
        style={{ writingMode: 'vertical-rl' }}
        className="fixed right-0 top-1/2 z-30 -translate-y-1/2 rounded-l-xl bg-primary px-2.5 py-4 text-sm font-medium tracking-wide text-primary-foreground shadow-[0_10px_30px_-12px_hsl(var(--primary)/0.6)] transition-[padding] hover:pr-3.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary [.cart-drawer-open_&]:hidden"
      >
        Reviews
      </button>
      {open && <StorePopup onClose={close} />}
    </>
  );
}
