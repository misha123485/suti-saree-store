'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Star, X, BadgeCheck, Camera, ArrowUpDown } from 'lucide-react';
import { getSupabaseBrowser } from '@/lib/supabase-browser';
import { fetchReviewDisplaySettings } from '@/lib/reviews-api';
import type { ReviewDisplaySettings } from '@/lib/review-display-settings';

/**
 * Floating maroon "Reviews" tab on the right edge of the storefront.
 *
 *  - Opens a popup with ALL reviews (verified buyers first, customer photos,
 *    star filters) and a "Store reviews" tab with a "Write a store review"
 *    form. On a product page it also links to that product's own reviews
 *    popup (components/product/reviews-section.tsx listens for the event).
 *  - Never shown on cart, checkout, the Shopping Bag drawer, admin or vendor
 *    pages.
 *  - Switch on/off in Admin > Reviews > Display settings
 *    ("Show floating Reviews badge"). Takes effect on the next page load.
 */
const HIDDEN_PREFIXES = ['/admin', '/vendor', '/checkout', '/cart', '/cart-link', '/confirm-order', '/review'];
const PAGE_SIZE = 20;

type Source = 'reviews' | 'store_reviews';
type Filter = 'all' | 'photos' | '5' | '4' | '3' | '2' | '1';
type Sort = 'verified' | 'newest' | 'highest' | 'lowest';

interface Row {
  id: string;
  customer_name: string;
  rating: number;
  title: string | null;
  comment: string | null;
  photos?: string[] | null;
  verified_purchase: boolean;
  created_at: string;
}

interface Stats {
  total: number;
  average: number;
  counts: Record<number, number>;
  photos: number;
  verified: number;
}

function Stars({ value, className = 'h-4 w-4' }: { value: number; className?: string }) {
  return (
    <span className="inline-flex gap-0.5" aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={`${className} ${n <= Math.round(value) ? 'fill-secondary text-secondary' : 'text-border'}`} />
      ))}
    </span>
  );
}

const chipBase = 'shrink-0 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors';
const chipOn = 'border-primary bg-primary/10 text-primary';
const chipOff = 'border-border bg-card text-foreground/80';

async function loadStats(source: Source): Promise<Stats> {
  const supabase = getSupabaseBrowser();
  const head = () => supabase.from(source).select('id', { count: 'exact', head: true }).eq('is_approved', true);
  const stars = [5, 4, 3, 2, 1];
  const [byStar, photos, verified] = await Promise.all([
    Promise.all(stars.map((s) => head().eq('rating', s))),
    source === 'reviews' ? head().not('photos', 'eq', '{}') : Promise.resolve({ count: 0 }),
    head().eq('verified_purchase', true),
  ]);
  const counts: Record<number, number> = {};
  let total = 0;
  let sum = 0;
  stars.forEach((s, i) => {
    const c = byStar[i].count ?? 0;
    counts[s] = c;
    total += c;
    sum += c * s;
  });
  return {
    total,
    average: total ? Math.round((sum / total) * 10) / 10 : 0,
    counts,
    photos: (photos as any).count ?? 0,
    verified: (verified as any).count ?? 0,
  };
}

/** One list of reviews (product reviews from the whole store, or store
 *  reviews) -- verified buyers always come first by default. */
function ReviewFeed({ source, canWrite, onWrite }: { source: Source; canWrite: boolean; onWrite: () => void }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [gallery, setGallery] = useState<string[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('verified');
  const isProduct = source === 'reviews';

  useEffect(() => {
    let cancelled = false;
    loadStats(source)
      .then((s) => !cancelled && setStats(s))
      .catch(() => {});
    if (isProduct) {
      getSupabaseBrowser()
        .from('reviews')
        .select('photos')
        .eq('is_approved', true)
        .not('photos', 'eq', '{}')
        .order('verified_purchase', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(12)
        .then(({ data }) => {
          if (cancelled) return;
          const urls = ((data ?? []) as { photos: string[] | null }[]).map((r) => r.photos?.[0]).filter((u): u is string => !!u);
          setGallery(urls);
        });
    }
    return () => {
      cancelled = true;
    };
  }, [source, isProduct]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        let q = getSupabaseBrowser()
          .from(source)
          .select(isProduct ? 'id, customer_name, rating, title, comment, photos, verified_purchase, created_at' : 'id, customer_name, rating, title, comment, verified_purchase, created_at')
          .eq('is_approved', true);
        if (filter === 'photos') q = q.not('photos', 'eq', '{}');
        else if (filter !== 'all') q = q.eq('rating', Number(filter));
        if (sort === 'verified') q = q.order('verified_purchase', { ascending: false }).order('created_at', { ascending: false });
        else if (sort === 'newest') q = q.order('created_at', { ascending: false });
        else if (sort === 'highest') q = q.order('rating', { ascending: false }).order('created_at', { ascending: false });
        else q = q.order('rating', { ascending: true }).order('created_at', { ascending: false });
        const { data, error } = await q.limit(limit);
        if (error) throw error;
        if (!cancelled) {
          setRows(((data ?? []) as unknown as Row[]).map((r) => ({ ...r, photos: r.photos ?? [] })));
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
  }, [source, isProduct, filter, sort, limit]);

  const change = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setLimit(PAGE_SIZE);
  };
  const canLoadMore = !loading && rows.length >= limit;

  return (
    <div className="flex flex-col gap-5">
      {stats && stats.total > 0 && (
        <div className="grid grid-cols-[auto_1fr] items-center gap-5">
          <div className="flex flex-col items-start gap-1.5">
            <span className="flex items-center gap-1.5 font-serif text-5xl font-bold leading-none text-foreground">
              {stats.average.toFixed(1)}
              <Star className="h-6 w-6 fill-secondary text-secondary" />
            </span>
            <span className="text-xs text-muted-foreground">{stats.total.toLocaleString('en-IN')} ratings</span>
            {stats.verified > 0 && (
              <span className="flex items-center gap-1 text-xs font-medium text-emerald-700">
                <BadgeCheck className="h-3.5 w-3.5" /> {stats.verified.toLocaleString('en-IN')} verified buyers
              </span>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            {[5, 4, 3, 2, 1].map((star) => (
              <div key={star} className="grid grid-cols-[1.75rem_1fr_2.5rem] items-center gap-2 text-xs text-muted-foreground">
                <span>{star} ★</span>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full ${star === 5 ? 'bg-emerald-600' : 'bg-secondary'}`}
                    style={{ width: `${(stats.counts[star] / stats.total) * 100}%` }}
                  />
                </div>
                <span className="text-right">{stats.counts[star].toLocaleString('en-IN')}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {canWrite && (
        <button
          type="button"
          onClick={onWrite}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-foreground py-3 text-sm font-semibold text-background"
        >
          <Star className="h-4 w-4 fill-secondary text-secondary" /> Write a store review
        </button>
      )}

      {isProduct && gallery.length > 0 && (
        <div>
          <p className="mb-2 flex items-center gap-1.5 font-serif text-sm font-semibold">
            <Camera className="h-4 w-4 text-secondary" /> Customer photos ({stats?.photos ?? gallery.length})
          </p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {gallery.map((src, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={i}
                src={src}
                alt={`Customer photo ${i + 1}`}
                loading="lazy"
                className="h-24 w-20 shrink-0 rounded-xl border border-border/60 object-cover"
              />
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-2 overflow-x-auto pb-1">
        {([['all', 'All'], ...(isProduct ? [['photos', `Photos ${stats?.photos ?? ''}`]] : []), ...[5, 4, 3, 2, 1].map((n) => [String(n), `${n} ★ ${stats?.counts[n] ?? ''}`])] as [Filter, string][]).map(([key, label]) => (
          <button
            key={key}
            type="button"
            aria-pressed={filter === key}
            onClick={() => change(setFilter)(key)}
            className={`${chipBase} ${filter === key ? chipOn : chipOff}`}
          >
            {label}
          </button>
        ))}
      </div>

      <label className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm">
        <ArrowUpDown className="h-4 w-4 text-primary" />
        <select
          value={sort}
          onChange={(e) => change(setSort)(e.target.value as Sort)}
          aria-label="Sort reviews"
          className="w-full bg-transparent font-medium text-primary outline-none"
        >
          <option value="verified">Verified buyers first</option>
          <option value="newest">Most recent</option>
          <option value="highest">Highest rating</option>
          <option value="lowest">Lowest rating</option>
        </select>
      </label>

      {failed && <p className="py-6 text-center text-sm text-muted-foreground">Reviews could not be loaded. Please try again.</p>}
      {loading && rows.length === 0 && !failed && <p className="py-6 text-center text-sm text-muted-foreground">Loading reviews…</p>}
      {!loading && !failed && rows.length === 0 && (
        <p className="py-6 text-center text-sm text-muted-foreground">No reviews here yet.</p>
      )}

      <ul className="flex flex-col gap-3">
        {rows.map((r) => (
          <li key={r.id} className="flex flex-col gap-2.5 rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-primary">
                {(r.customer_name || '?').trim().charAt(0).toUpperCase()}
              </span>
              <p className="min-w-0 flex-1 truncate text-sm font-semibold">{r.customer_name}</p>
              {r.verified_purchase && (
                <span className="flex items-center gap-1 text-xs font-medium text-emerald-700">
                  <BadgeCheck className="h-3.5 w-3.5" /> Verified buyer
                </span>
              )}
            </div>
            <div className="rounded-lg bg-muted/70 px-3 py-1.5">
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
                    className="h-28 w-24 shrink-0 rounded-xl border border-border/60 object-cover"
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
  );
}

function WriteStoreReview({ onBack }: { onBack: () => void }) {
  const [rating, setRating] = useState(0);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [title, setTitle] = useState('');
  const [comment, setComment] = useState('');
  const [trap, setTrap] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<null | { published: boolean }>(null);

  const submit = async () => {
    setError('');
    if (rating < 1) return setError('Please select a star rating.');
    setBusy(true);
    try {
      const res = await fetch('/api/store-reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating, name, email, title, comment, website: trap }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Could not submit your review.');
      setDone({ published: !!json.published });
    } catch (e: any) {
      setError(e.message || 'Could not submit your review.');
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <BadgeCheck className="h-10 w-10 text-emerald-600" />
        <h3 className="font-serif text-xl font-semibold text-primary">Thank you for your review</h3>
        <p className="max-w-xs text-sm text-muted-foreground">
          {done.published ? 'Your review is now live.' : 'Your review will appear after our team approves it.'}
        </p>
        <button type="button" onClick={onBack} className="mt-2 rounded-full border border-primary px-6 py-2.5 text-sm font-medium text-primary">
          Back to reviews
        </button>
      </div>
    );
  }

  const field = 'w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm outline-none focus:border-primary';
  return (
    <div className="flex flex-col gap-4">
      <button type="button" onClick={onBack} className="w-fit text-xs font-medium text-primary underline-offset-2 hover:underline">
        Back to reviews
      </button>
      <h3 className="font-serif text-xl font-semibold text-primary">How was your experience with Sutisaree?</h3>
      <div role="radiogroup" aria-label="Your rating" className="flex gap-1.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n} star${n > 1 ? 's' : ''}`} onClick={() => setRating(n)}>
            <Star className={`h-9 w-9 ${n <= rating ? 'fill-secondary text-secondary' : 'text-border'}`} />
          </button>
        ))}
      </div>
      <input className={field} placeholder="Your name" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
      <input
        className={field}
        type="email"
        placeholder="Email (optional, adds a Verified buyer badge if you have ordered)"
        value={email}
        maxLength={120}
        onChange={(e) => setEmail(e.target.value)}
      />
      <input className={field} placeholder="Title (optional)" value={title} maxLength={100} onChange={(e) => setTitle(e.target.value)} />
      <textarea
        className={`${field} min-h-[110px]`}
        placeholder="Tell us about delivery, packing, support and quality"
        value={comment}
        maxLength={1000}
        onChange={(e) => setComment(e.target.value)}
      />
      {/* Honeypot: hidden from people, bots fill it */}
      <input tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" name="website" value={trap} onChange={(e) => setTrap(e.target.value)} />
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <button
        type="button"
        disabled={busy}
        onClick={submit}
        className="rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
      >
        {busy ? 'Submitting…' : 'Submit store review'}
      </button>
    </div>
  );
}

function ReviewsHub({
  onClose,
  onProductPage,
  canWrite,
}: {
  onClose: () => void;
  onProductPage: boolean;
  canWrite: boolean;
}) {
  const [tab, setTab] = useState<Source>('reviews');
  const [writing, setWriting] = useState(false);

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

  const openProductReviews = () => {
    onClose();
    window.dispatchEvent(new Event('open-reviews-sheet'));
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-foreground/50 backdrop-blur-[2px] sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Customer reviews"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-t-3xl bg-background shadow-2xl sm:rounded-3xl"
      >
        <div className="flex items-center justify-between border-b border-border/70 px-5 py-4">
          <h2 className="font-serif text-xl font-semibold text-primary">Customer reviews</h2>
          <button type="button" onClick={onClose} aria-label="Close reviews" className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card">
            <X className="h-4 w-4" />
          </button>
        </div>

        {!writing && (
          <div className="flex gap-2 overflow-x-auto px-5 pt-4">
            <button type="button" aria-pressed={tab === 'reviews'} onClick={() => setTab('reviews')} className={`${chipBase} ${tab === 'reviews' ? chipOn : chipOff}`}>
              All reviews
            </button>
            <button type="button" aria-pressed={tab === 'store_reviews'} onClick={() => setTab('store_reviews')} className={`${chipBase} ${tab === 'store_reviews' ? chipOn : chipOff}`}>
              Store reviews
            </button>
            {onProductPage && (
              <button type="button" onClick={openProductReviews} className={`${chipBase} ${chipOff}`}>
                This product’s reviews
              </button>
            )}
          </div>
        )}

        <div className="overflow-y-auto px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] pt-5">
          {writing ? (
            <WriteStoreReview onBack={() => { setWriting(false); setTab('store_reviews'); }} />
          ) : (
            <ReviewFeed key={tab} source={tab} canWrite={canWrite} onWrite={() => setWriting(true)} />
          )}
        </div>
      </div>
    </div>
  );
}

let cachedSettings: ReviewDisplaySettings | null = null;

export default function ReviewsBadge() {
  const pathname = usePathname() || '';
  const [settings, setSettings] = useState<ReviewDisplaySettings | null>(cachedSettings);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (cachedSettings) return;
    let cancelled = false;
    fetchReviewDisplaySettings().then((st) => {
      cachedSettings = st;
      if (!cancelled) setSettings(st);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Close the popup when the shopper navigates.
  useEffect(() => setOpen(false), [pathname]);

  const close = useCallback(() => setOpen(false), []);

  const hidden = HIDDEN_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (!settings?.showFloatingBadge || hidden) return null;

  const onProductPage = pathname.startsWith('/product/');

  return (
    <>
      {/* `cart-drawer-open` is toggled on <body> by components/cart-drawer.tsx */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open customer reviews"
        style={{ writingMode: 'vertical-rl' }}
        className="fixed right-0 top-1/2 z-30 -translate-y-1/2 rounded-l-xl bg-primary px-2.5 py-4 text-sm font-medium tracking-wide text-primary-foreground shadow-[0_10px_30px_-12px_hsl(var(--primary)/0.6)] transition-[padding] hover:pr-3.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary [.cart-drawer-open_&]:hidden"
      >
        Reviews
      </button>
      {open && <ReviewsHub onClose={close} onProductPage={onProductPage} canWrite={settings.allowStoreReviews} />}
    </>
  );
}
