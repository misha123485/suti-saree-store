'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { Star, CheckCircle2, ImagePlus, X, Loader2, ThumbsUp, ChevronLeft, ChevronRight, ChevronDown, Camera, Pin, ArrowUpDown } from 'lucide-react';
import { toPublicMediaUrl } from '@/lib/media-url';
import { useAuth } from '@/lib/auth-context';
import {
  Review,
  fetchApprovedReviews,
  fetchReviewDisplaySettings,
  fetchMyReviewForProduct,
  filterReviewsByColor,
  getReviewColorOptions,
  hasPurchasedProduct,
  hasWrittenContent,
  scheduleAutoPublish,
  submitReview,
  summarizeReviews,
  updateMyReview,
  uploadReviewPhoto,
} from '@/lib/reviews-api';
import { DEFAULT_REVIEW_DISPLAY_SETTINGS, type ReviewDisplaySettings, type ReviewSort } from '@/lib/review-display-settings';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';

function StarRow({
  value,
  size = 'h-4 w-4',
}: {
  value: number;
  size?: string;
}) {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={`${size} ${
            i < Math.round(value) ? 'fill-secondary text-secondary' : 'text-muted-foreground/30'
          }`}
        />
      ))}
    </div>
  );
}

function StarPicker({
  value,
  onChange,
}: {
  value: number;
  onChange: (n: number) => void;
}) {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: 5 }).map((_, i) => {
        const n = i + 1;
        return (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            onMouseEnter={() => setHover(n)}
            onMouseLeave={() => setHover(0)}
            aria-label={`Rate ${n} stars`}
          >
            <Star
              className={`h-7 w-7 transition-colors ${
                n <= (hover || value)
                  ? 'fill-secondary text-secondary'
                  : 'text-muted-foreground/30'
              }`}
            />
          </button>
        );
      })}
    </div>
  );
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
}

/** Public-facing reviews only ever show the reviewer's first name, for privacy. */
function firstName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts[0] ?? name;
}


// 64px thumbnails should not download the full-size review photo. New
// uploads get a "<name>-sm.webp" (480px) sibling (see
// app/api/upload-review-photo/route.ts); older photos get one from the
// admin "Resize backfill". The <img> falls back to the original on error.
function reviewThumbUrl(src: string): string {
  const full = toPublicMediaUrl(src) || src;
  const dot = full.lastIndexOf('.');
  if (dot === -1 || full.includes('data:') || full.startsWith('blob:')) return full;
  return `${full.slice(0, dot)}-sm.webp`;
}


type RatingFilter = 'all' | 'photos' | '5' | '4' | '3' | '2' | '1';
type SheetSort = ReviewSort | 'helpful';

interface PhotoItem {
  src: string;
  reviewId: string;
  name: string;
  rating: number;
  comment: string | null;
}

/** Square thumbnail that falls back to the original photo when the
 *  "-sm.webp" sibling does not exist yet (older / imported photos). */
function PhotoThumb({ src, alt, className }: { src: string; alt: string; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={reviewThumbUrl(src)}
      alt={alt}
      loading="lazy"
      decoding="async"
      onError={(e) => {
        const img = e.currentTarget;
        if (img.dataset.fallback) return;
        img.dataset.fallback = '1';
        img.src = toPublicMediaUrl(src) || src;
      }}
      className={className}
    />
  );
}

/** Full-screen photo viewer with previous / next, keyboard and swipe. */
function PhotoLightbox({
  items,
  index,
  onIndex,
  onClose,
}: {
  items: PhotoItem[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
}) {
  const [touchX, setTouchX] = useState<number | null>(null);
  const item = items[index];
  const go = (dir: -1 | 1) => onIndex((index + dir + items.length) % items.length);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === 'ArrowRight') go(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, items.length]);

  if (!item) return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex flex-col bg-black/95"
      onClick={onClose}
      onTouchStart={(e) => setTouchX(e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touchX === null) return;
        const dx = e.changedTouches[0].clientX - touchX;
        setTouchX(null);
        if (Math.abs(dx) > 50 && items.length > 1) go(dx > 0 ? -1 : 1);
      }}
    >
      <div className="flex items-center justify-between px-4 py-3 text-white/80">
        <span className="text-xs font-medium tracking-wide">
          {index + 1} / {items.length}
        </span>
        <button
          type="button"
          aria-label="Close photo"
          onClick={onClose}
          className="rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center px-2 sm:px-14">
        {items.length > 1 && (
          <button
            type="button"
            aria-label="Previous photo"
            onClick={(e) => {
              e.stopPropagation();
              go(-1);
            }}
            className="absolute left-2 z-10 hidden rounded-full bg-white/10 p-2.5 text-white hover:bg-white/20 sm:block"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
        )}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={toPublicMediaUrl(item.src) || item.src}
          alt={`Photo from ${item.name}'s review`}
          className="max-h-full max-w-full rounded-xl object-contain"
          onClick={(e) => e.stopPropagation()}
        />
        {items.length > 1 && (
          <button
            type="button"
            aria-label="Next photo"
            onClick={(e) => {
              e.stopPropagation();
              go(1);
            }}
            className="absolute right-2 z-10 hidden rounded-full bg-white/10 p-2.5 text-white hover:bg-white/20 sm:block"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        )}
      </div>

      <div className="px-4 pb-6 pt-3 text-white" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto flex max-w-xl flex-col items-center gap-1.5 text-center">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">{item.name}</span>
            <StarRow value={item.rating} size="h-3.5 w-3.5" />
          </div>
          {item.comment && <p className="line-clamp-2 text-xs leading-relaxed text-white/70">{item.comment}</p>}
          {items.length > 1 && <p className="text-[11px] text-white/40 sm:hidden">Swipe left or right for more photos</p>}
        </div>
      </div>
    </div>,
    document.body
  );
}

const COMMENT_CLAMP = 220;

/* ------------------------------------------------------------------ */
/*  Small shared pieces                                                */
/* ------------------------------------------------------------------ */

function ratingTone(value: number) {
  if (value >= 3.5) return 'bg-emerald-600';
  if (value >= 2.5) return 'bg-amber-500';
  return 'bg-red-500';
}

/** Green "3.9 ★" pill (Meesho style). */
function RatingChip({ value, className = '' }: { value: number; className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-bold text-white ${ratingTone(value)} ${className}`}
    >
      {Number.isInteger(value) ? value : value.toFixed(1)}
      <Star className="h-3 w-3 fill-white" />
    </span>
  );
}

const BAR_TONE: Record<number, string> = {
  5: 'bg-emerald-600',
  4: 'bg-emerald-500',
  3: 'bg-lime-500',
  2: 'bg-orange-400',
  1: 'bg-red-500',
};

function RatingBars({
  breakdown,
  total,
  active,
  onPick,
}: {
  breakdown: Record<number, number>;
  total: number;
  active?: RatingFilter;
  onPick?: (f: RatingFilter) => void;
}) {
  return (
    <div className="flex w-full flex-col gap-1.5">
      {[5, 4, 3, 2, 1].map((n) => {
        const count = breakdown[n] ?? 0;
        const pct = total > 0 ? (count / total) * 100 : 0;
        const on = active === String(n);
        return (
          <button
            key={n}
            type="button"
            disabled={count === 0}
            onClick={() => onPick?.(on ? 'all' : (String(n) as RatingFilter))}
            className={`flex items-center gap-2 rounded-md px-1 py-0.5 text-xs transition-colors ${
              on ? 'bg-primary/10' : 'hover:bg-muted/60'
            } disabled:cursor-default disabled:hover:bg-transparent`}
            aria-label={`${count} reviews with ${n} stars`}
          >
            <span className="flex w-6 shrink-0 items-center gap-0.5 font-semibold text-foreground">
              {n}
              <Star className="h-3 w-3 fill-foreground/70 text-foreground/70" />
            </span>
            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
              <span className={`block h-full rounded-full ${BAR_TONE[n]}`} style={{ width: `${pct}%` }} />
            </span>
            <span className="w-8 shrink-0 text-right tabular-nums text-muted-foreground">{count}</span>
          </button>
        );
      })}
    </div>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** "Most helpful" without a backend vote count: shopper votes first, then
 *  reviews that carry photos + real text, then verified, then newest. */
function helpfulScore(r: Review, votes: Record<string, number>) {
  return (
    (votes[r.id] ?? 0) * 100 +
    ((r.photos?.length ?? 0) > 0 ? 20 : 0) +
    Math.min((r.comment?.length ?? 0) / 30, 10) +
    (r.verified_purchase ? 5 : 0)
  );
}

/* ------------------------------------------------------------------ */
/*  Inline (on-page) compact review card -- tap opens the popup        */
/* ------------------------------------------------------------------ */

function ReviewPreviewCard({ r, onOpen }: { r: Review; onOpen: () => void }) {
  const photos = (r.photos ?? []).filter(Boolean);
  const hasText = !!(r.title || r.comment);
  return (
    <li className="w-[86%] shrink-0 snap-start sm:w-[60%] lg:w-auto">
      <div
        role="button"
        tabIndex={0}
        onClick={onOpen}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onOpen();
          }
        }}
        className="flex h-full min-h-[148px] cursor-pointer flex-col justify-between gap-3 rounded-2xl border border-border/60 bg-card p-3.5 shadow-[0_1px_12px_-6px_rgba(0,0,0,0.1)] transition-shadow hover:shadow-md active:scale-[0.99]"
      >
        <div className="flex items-center gap-2">
          <RatingChip value={r.rating} />
          <span className="text-[11px] text-muted-foreground">{formatDate(r.created_at)}</span>
          {r.variant_color && (
            <span className="ml-auto truncate rounded-full border border-border/60 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              {r.variant_color}
            </span>
          )}
        </div>

        <div className="flex min-h-0 flex-1 items-start gap-3">
          <div className="min-w-0 flex-1 text-[13px] leading-relaxed text-foreground/85">
            {hasText ? (
              <>
                {r.title && <p className="line-clamp-1 font-semibold text-foreground">{r.title}</p>}
                {r.comment && <p className="line-clamp-3 break-words">{r.comment}</p>}
                {(r.comment?.length ?? 0) > 90 && (
                  <span className="text-xs font-semibold text-primary">read more</span>
                )}
              </>
            ) : (
              <p className="text-muted-foreground">Rated {r.rating} out of 5</p>
            )}
          </div>
          {photos.length > 0 && (
            <div className="relative mr-1 mt-0.5 h-16 w-16 shrink-0">
              {photos.length > 1 && (
                <span className="absolute inset-0 rotate-6 rounded-lg border border-border/60 bg-muted" />
              )}
              <PhotoThumb
                src={photos[0]}
                alt={`Photo from ${firstName(r.customer_name)}'s review`}
                className="relative h-full w-full rounded-lg border-2 border-background object-cover shadow-md"
              />
              {photos.length > 1 && (
                <span className="absolute -bottom-1 -right-1 rounded-full bg-foreground px-1.5 text-[10px] font-semibold text-background">
                  +{photos.length - 1}
                </span>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <CheckCircle2 className={`h-3.5 w-3.5 ${r.verified_purchase ? 'text-emerald-600' : 'text-muted-foreground/50'}`} />
          <span className="truncate font-medium">{firstName(r.customer_name)}</span>
        </div>
      </div>
    </li>
  );
}

/* ------------------------------------------------------------------ */
/*  Full review row inside the popup                                   */
/* ------------------------------------------------------------------ */

function SheetReviewItem({
  r,
  featured,
  helpful,
  helpfulCount,
  onToggleHelpful,
  onOpenPhoto,
}: {
  r: Review;
  featured: boolean;
  helpful: boolean;
  helpfulCount: number;
  onToggleHelpful: () => void;
  onOpenPhoto: (src: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const long = (r.comment?.length ?? 0) > COMMENT_CLAMP;
  const photos = (r.photos ?? []).filter(Boolean);
  return (
    <li id={`rv-${r.id}`} className="scroll-mt-28 border-b border-border/60 py-4 last:border-b-0">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <RatingChip value={r.rating} />
        <span className="text-xs text-muted-foreground">{formatDate(r.created_at)}</span>
        {r.variant_color && (
          <span className="rounded-full border border-border/60 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            {r.variant_color}
          </span>
        )}
        {featured && (
          <span className="inline-flex items-center gap-1 rounded-full bg-secondary/15 px-2 py-0.5 text-[11px] font-semibold text-secondary">
            <Pin className="h-3 w-3" />
            Top review
          </span>
        )}
      </div>

      {r.title && <p className="mt-2.5 text-sm font-semibold text-foreground">{r.title}</p>}
      {r.comment && (
        <p
          className={`mt-1.5 whitespace-pre-line break-words text-sm leading-relaxed text-foreground/85 ${
            long && !expanded ? 'line-clamp-4' : ''
          }`}
        >
          {r.comment}
        </p>
      )}
      {long && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1 text-xs font-semibold text-primary underline-offset-2 hover:underline"
        >
          {expanded ? 'Show less' : 'Read more'}
        </button>
      )}

      {photos.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {photos.map((src, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => onOpenPhoto(src)}
              className="h-24 w-20 shrink-0 overflow-hidden rounded-xl border border-border/60 transition-transform active:scale-95 sm:h-28 sm:w-24"
              aria-label={`Open photo ${idx + 1} from ${firstName(r.customer_name)}`}
            >
              <PhotoThumb
                src={src}
                alt={`Photo from ${firstName(r.customer_name)}'s review`}
                className="h-full w-full object-cover"
              />
            </button>
          ))}
        </div>
      )}

      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          <CheckCircle2 className={`h-3.5 w-3.5 shrink-0 ${r.verified_purchase ? 'text-emerald-600' : 'text-muted-foreground/50'}`} />
          <span className="truncate font-medium">{firstName(r.customer_name)}</span>
          {r.verified_purchase && <span className="shrink-0 text-emerald-700 dark:text-emerald-400">· Verified Purchase</span>}
        </span>
        <button
          type="button"
          onClick={onToggleHelpful}
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-medium transition-all active:scale-95 ${
            helpful
              ? 'border-primary/40 bg-primary/10 text-primary'
              : 'border-border/60 text-muted-foreground hover:border-primary/40 hover:text-primary'
          }`}
        >
          <ThumbsUp className={`h-3 w-3 ${helpful ? 'fill-primary' : ''}`} />
          Helpful{helpfulCount ? ` (${helpfulCount})` : ''}
        </button>
      </div>
    </li>
  );
}

const chipBase =
  'shrink-0 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40';
const chipOn = 'border-primary bg-primary/10 text-primary';
const chipOff = 'border-border/70 bg-card text-foreground/80 hover:border-primary/40 hover:text-primary';

/* ------------------------------------------------------------------ */
/*  The popup: bottom sheet on mobile, centred panel on desktop        */
/* ------------------------------------------------------------------ */

interface SheetProps {
  onClose: () => void;
  suspendKeys: boolean;
  summary: ReturnType<typeof summarizeReviews>;
  loading: boolean;
  settings: ReviewDisplaySettings;
  allPhotos: PhotoItem[];
  featuredSet: Set<string>;
  ratingFilter: RatingFilter;
  setRatingFilter: (f: RatingFilter) => void;
  chipCounts: Record<string, number>;
  sort: SheetSort;
  setSort: (s: SheetSort) => void;
  colorOptions: string[];
  colorFilter: string | null;
  setColorFilter: (c: string | null) => void;
  selectedColor?: string | null;
  totalForColors: number;
  colorCount: (color: string) => number;
  sortedReviews: Review[];
  visibleReviews: Review[];
  remaining: number;
  onLoadMore: () => void;
  markedHelpful: Record<string, boolean>;
  helpfulVotes: Record<string, number>;
  toggleHelpful: (id: string) => void;
  onOpenPhotoAt: (i: number) => void;
  onOpenReviewPhoto: (reviewId: string, src: string) => void;
  focusReviewId: string | null;
  writeCta: { label: string; onClick: () => void } | null;
  onClearFilters: () => void;
}

function ReviewsSheet(p: SheetProps) {
  const [shown, setShown] = useState(false);
  const [dragY, setDragY] = useState(0);
  const dragStart = useRef<number | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const { onClose, suspendKeys } = p;

  const close = () => {
    setShown(false);
    window.setTimeout(onClose, 220);
  };

  // Slide in, lock the page behind it.
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true));
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      cancelAnimationFrame(id);
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    if (suspendKeys) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suspendKeys]);

  // Opened by tapping a specific review -> scroll straight to it.
  useEffect(() => {
    if (!p.focusReviewId) return;
    const t = window.setTimeout(() => {
      bodyRef.current?.querySelector(`#rv-${CSS.escape(p.focusReviewId as string)}`)?.scrollIntoView({ block: 'start' });
    }, 80);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.focusReviewId]);

  // Auto "load more" when the shopper reaches the end of the list.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || p.remaining <= 0 || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) p.onLoadMore();
    }, { rootMargin: '200px' });
    io.observe(el);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.remaining, p.visibleReviews.length]);

  const isMobile = () => typeof window !== 'undefined' && window.innerWidth < 1024;
  const onTouchStart = (e: React.TouchEvent) => {
    if (!isMobile()) return;
    dragStart.current = e.touches[0].clientY;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (dragStart.current === null) return;
    setDragY(Math.max(0, e.touches[0].clientY - dragStart.current));
  };
  const onTouchEnd = () => {
    if (dragStart.current === null) return;
    const dy = dragY;
    dragStart.current = null;
    setDragY(0);
    if (dy > 110) close();
  };

  const { summary, settings } = p;
  const galleryItems = p.allPhotos.slice(0, settings.photoGalleryMax);
  const galleryExtra = Math.max(0, p.allPhotos.length - galleryItems.length);

  const filterChips: [RatingFilter, string][] = [
    ['all', 'All'],
    ['photos', 'Photos'],
    ['5', '5 ★'],
    ['4', '4 ★'],
    ['3', '3 ★'],
    ['2', '2 ★'],
    ['1', '1 ★'],
  ];

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center lg:items-center lg:p-6" role="dialog" aria-modal="true" aria-label="Ratings and reviews">
      <div
        className={`absolute inset-0 bg-black/55 transition-opacity duration-200 ${shown ? 'opacity-100' : 'opacity-0'}`}
        onClick={close}
      />

      <div
        className={`relative flex h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl bg-background shadow-2xl lg:h-[86vh] lg:max-w-5xl lg:rounded-3xl ${
          dragY ? '' : 'transition-all duration-200 ease-out'
        } ${shown ? 'translate-y-0 opacity-100 lg:scale-100' : 'translate-y-full opacity-0 lg:translate-y-4 lg:scale-95'}`}
        style={dragY ? { transform: `translateY(${dragY}px)` } : undefined}
      >
        {/* Header (also the swipe-down handle on mobile) */}
        <div
          className="shrink-0 border-b border-border/60 bg-background"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-muted-foreground/30 lg:hidden" />
          <div className="flex items-center justify-between px-4 py-3 lg:px-6 lg:py-4">
            <h2 className="font-serif text-lg font-bold text-foreground">Ratings &amp; Reviews</h2>
            <button
              type="button"
              onClick={close}
              aria-label="Close reviews"
              className="rounded-full bg-muted p-2 text-foreground/70 transition-colors hover:bg-muted/70 hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Scrolling body */}
        <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div className="lg:grid lg:grid-cols-[300px_1fr]">
            {/* Left / top: summary, bars, photos */}
            <aside className="flex flex-col gap-5 p-4 lg:sticky lg:top-0 lg:max-h-full lg:self-start lg:border-r lg:border-border/60 lg:p-6">
              <div className="flex items-center gap-4">
                <div className="flex shrink-0 flex-col items-center">
                  <p className="flex items-center gap-1 text-4xl font-bold leading-none text-foreground">
                    {summary.totalRatings > 0 ? summary.average.toFixed(1) : '—'}
                    <Star className={`h-6 w-6 ${summary.totalRatings > 0 ? 'fill-emerald-600 text-emerald-600' : 'text-muted-foreground/30'}`} />
                  </p>
                  <p className="mt-1.5 text-center text-[11px] leading-tight text-muted-foreground">
                    {summary.totalRatings.toLocaleString('en-IN')} verified
                    <br />
                    rating{summary.totalRatings === 1 ? '' : 's'}
                  </p>
                </div>
                <div className="min-w-0 flex-1 border-l border-border/60 pl-3">
                  <RatingBars
                    breakdown={summary.breakdown as unknown as Record<number, number>}
                    total={summary.totalRatings}
                    active={p.ratingFilter}
                    onPick={p.setRatingFilter}
                  />
                </div>
              </div>

              {p.writeCta && (
                <Button
                  onClick={p.writeCta.onClick}
                  className="w-full bg-gradient-to-r from-primary via-primary to-primary/90 text-primary-foreground shadow-sm"
                >
                  <Star className="mr-1.5 h-4 w-4 fill-secondary text-secondary" />
                  {p.writeCta.label}
                </Button>
              )}

              {settings.showPhotoGallery && p.allPhotos.length > 0 && (
                <div>
                  <h3 className="mb-2.5 flex items-center gap-2 text-sm font-semibold text-foreground">
                    <Camera className="h-4 w-4 text-secondary" />
                    Customer Photos ({p.allPhotos.length})
                  </h3>
                  <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:grid lg:grid-cols-3 lg:overflow-visible lg:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {galleryItems.map((ph, i) => {
                      const isLast = i === galleryItems.length - 1 && galleryExtra > 0;
                      return (
                        <button
                          key={`${ph.reviewId}-${i}`}
                          type="button"
                          onClick={() => p.onOpenPhotoAt(i)}
                          aria-label={isLast ? `See ${galleryExtra} more photos` : `Open customer photo ${i + 1}`}
                          className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-border/60 transition-transform active:scale-95 lg:h-auto lg:w-full lg:aspect-square"
                        >
                          <PhotoThumb src={ph.src} alt={`Customer photo ${i + 1}`} className="h-full w-full object-cover" />
                          {isLast && (
                            <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-base font-semibold text-white">
                              +{galleryExtra + 1}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </aside>

            {/* Right / below: filters + list */}
            <section className="min-w-0">
              {settings.showFilters && (
                <div className="sticky top-0 z-10 flex flex-col gap-2.5 border-y border-border/60 bg-background/95 px-4 py-3 backdrop-blur lg:border-t-0 lg:px-6">
                  <div className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] lg:mx-0 lg:flex-wrap lg:px-0 [&::-webkit-scrollbar]:hidden">
                    {filterChips.map(([key, label]) => (
                      <button
                        key={key}
                        type="button"
                        disabled={key !== 'all' && p.chipCounts[key] === 0}
                        onClick={() => p.setRatingFilter(key)}
                        className={`${chipBase} ${p.ratingFilter === key ? chipOn : chipOff}`}
                      >
                        {label}
                        {key !== 'all' && <span className="ml-1 text-[10px] opacity-60">{p.chipCounts[key]}</span>}
                      </button>
                    ))}
                  </div>

                  <div className="relative">
                    <ArrowUpDown className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-primary" />
                    <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-primary" />
                    <select
                      value={p.sort}
                      onChange={(e) => p.setSort(e.target.value as SheetSort)}
                      aria-label="Sort reviews"
                      className="w-full appearance-none rounded-xl border border-primary/40 bg-card py-2.5 pl-10 pr-10 text-sm font-semibold text-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                    >
                      <option value="helpful">Most Helpful</option>
                      <option value="newest">Most Recent</option>
                      <option value="photos">Photos first</option>
                      <option value="highest">Highest rating</option>
                      <option value="lowest">Lowest rating</option>
                    </select>
                  </div>

                  {settings.showColorFilter && p.colorOptions.length > 1 && (
                    <div className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] lg:mx-0 lg:flex-wrap lg:px-0 [&::-webkit-scrollbar]:hidden">
                      <button
                        type="button"
                        onClick={() => p.setColorFilter(null)}
                        className={`${chipBase} ${p.colorFilter === null ? chipOn : chipOff}`}
                      >
                        All variations ({p.totalForColors})
                      </button>
                      {p.colorOptions.map((color) => {
                        const active = p.colorFilter?.toLowerCase() === color.toLowerCase();
                        return (
                          <button
                            key={color}
                            type="button"
                            onClick={() => p.setColorFilter(color)}
                            className={`${chipBase} ${
                              active
                                ? chipOn
                                : color.toLowerCase() === p.selectedColor?.toLowerCase()
                                ? 'border-secondary/60 bg-card text-secondary'
                                : chipOff
                            }`}
                          >
                            {color} ({p.colorCount(color)})
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              <div className="px-4 pb-8 pt-4 lg:px-6">
                <h3 className="mb-1 text-sm font-semibold text-foreground">
                  Customer Reviews ({p.sortedReviews.length})
                </h3>

                {p.loading ? (
                  <div className="flex flex-col gap-4 pt-3">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <Skeleton key={i} className="h-28 w-full rounded-2xl" />
                    ))}
                  </div>
                ) : p.sortedReviews.length === 0 ? (
                  <div className="mt-3 rounded-2xl border border-dashed border-border/60 p-8 text-center text-sm text-muted-foreground">
                    No reviews match these filters.{' '}
                    <button
                      type="button"
                      onClick={p.onClearFilters}
                      className="font-semibold text-primary underline underline-offset-2"
                    >
                      Clear filters
                    </button>
                  </div>
                ) : (
                  <>
                    <ul className="flex flex-col">
                      {p.visibleReviews.map((r) => (
                        <SheetReviewItem
                          key={r.id}
                          r={r}
                          featured={p.featuredSet.has(r.id)}
                          helpful={!!p.markedHelpful[r.id]}
                          helpfulCount={p.helpfulVotes[r.id] ?? 0}
                          onToggleHelpful={() => p.toggleHelpful(r.id)}
                          onOpenPhoto={(src) => p.onOpenReviewPhoto(r.id, src)}
                        />
                      ))}
                    </ul>
                    <div ref={sentinelRef} className="flex flex-col items-center gap-2 pt-3">
                      <p className="text-xs text-muted-foreground">
                        Showing {p.visibleReviews.length} of {p.sortedReviews.length} review
                        {p.sortedReviews.length === 1 ? '' : 's'}
                      </p>
                      {p.remaining > 0 && (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={p.onLoadMore}
                          className="w-full rounded-full border-primary/40 px-8 font-semibold text-primary hover:bg-primary/5 sm:w-auto"
                        >
                          Load more reviews ({p.remaining} more)
                        </Button>
                      )}
                    </div>
                  </>
                )}
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

/* ------------------------------------------------------------------ */
/*  Main section                                                       */
/* ------------------------------------------------------------------ */

export default function ReviewsSection({
  productId,
  productSlug,
  selectedColor,
}: {
  productId: string;
  productSlug: string;
  /** Colour of the variant currently open on the page -- highlighted (but
   *  not force-applied) in the "Variation" chips inside the popup. */
  selectedColor?: string | null;
}) {
  const { user } = useAuth();
  const router = useRouter();

  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [myReview, setMyReview] = useState<Review | null>(null);
  const [eligible, setEligible] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [step, setStep] = useState<'rating' | 'details'>('rating');
  const [rating, setRating] = useState(0);
  const [title, setTitle] = useState('');
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [settings, setSettings] = useState<ReviewDisplaySettings>(DEFAULT_REVIEW_DISPLAY_SETTINGS);
  const [ratingFilter, setRatingFilter] = useState<RatingFilter>('all');
  const [sort, setSort] = useState<SheetSort>('helpful');
  const [visibleCount, setVisibleCount] = useState(DEFAULT_REVIEW_DISPLAY_SETTINGS.initialCount);
  const [helpfulVotes, setHelpfulVotes] = useState<Record<string, number>>({});
  const [markedHelpful, setMarkedHelpful] = useState<Record<string, boolean>>({});
  const [colorFilter, setColorFilter] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [focusReviewId, setFocusReviewId] = useState<string | null>(null);
  const formRef = useRef<HTMLDivElement | null>(null);

  const MAX_PHOTOS = 4;

  const toggleHelpful = (reviewId: string) => {
    setMarkedHelpful((prev) => {
      const next = { ...prev, [reviewId]: !prev[reviewId] };
      setHelpfulVotes((v) => ({
        ...v,
        [reviewId]: (v[reviewId] ?? 0) + (next[reviewId] ? 1 : -1),
      }));
      return next;
    });
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([fetchApprovedReviews(productId)]).then(([r]) => {
      if (!cancelled) {
        setReviews(r);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [productId]);

  useEffect(() => {
    let cancelled = false;
    fetchReviewDisplaySettings().then((s) => {
      if (cancelled) return;
      setSettings(s);
      // "Most Helpful" is the popup default; only override it when the admin
      // picked something other than the factory default (newest).
      if (s.defaultSort !== 'newest') setSort(s.defaultSort);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!user) {
      setMyReview(null);
      setEligible(false);
      return;
    }
    fetchMyReviewForProduct(productId).then(setMyReview).catch(() => {});
    hasPurchasedProduct(productId).then(setEligible).catch(() => {});
  }, [user, productId]);

  const summary = summarizeReviews(reviews);
  const colorOptions = getReviewColorOptions(reviews);
  const filteredReviews = filterReviewsByColor(reviews, colorFilter);
  const featuredSet = useMemo(() => new Set(settings.featuredReviewIds), [settings.featuredReviewIds]);

  // Every customer photo (pinned reviews first, then newest) -- feeds the
  // photo strips and the full-screen viewer.
  const allPhotos = useMemo<PhotoItem[]>(() => {
    const ordered = [...reviews].sort((a, b) => Number(featuredSet.has(b.id)) - Number(featuredSet.has(a.id)));
    const out: PhotoItem[] = [];
    for (const r of ordered) {
      for (const src of r.photos ?? []) {
        if (src) out.push({ src, reviewId: r.id, name: firstName(r.customer_name), rating: r.rating, comment: r.comment });
      }
    }
    return out;
  }, [reviews, featuredSet]);

  const matchesRating = (r: Review) =>
    ratingFilter === 'all'
      ? true
      : ratingFilter === 'photos'
      ? (r.photos?.length ?? 0) > 0
      : r.rating === Number(ratingFilter);

  const chipCounts: Record<string, number> = {
    all: filteredReviews.length,
    photos: filteredReviews.filter((r) => (r.photos?.length ?? 0) > 0).length,
    '5': filteredReviews.filter((r) => r.rating === 5).length,
    '4': filteredReviews.filter((r) => r.rating === 4).length,
    '3': filteredReviews.filter((r) => r.rating === 3).length,
    '2': filteredReviews.filter((r) => r.rating === 2).length,
    '1': filteredReviews.filter((r) => r.rating === 1).length,
  };

  const sortedReviews = useMemo(() => {
    const list = filteredReviews.filter(matchesRating);
    const time = (r: Review) => new Date(r.created_at).getTime();
    const hasPhoto = (r: Review) => ((r.photos?.length ?? 0) > 0 ? 1 : 0);
    return list.sort((a, b) => {
      const pin = Number(featuredSet.has(b.id)) - Number(featuredSet.has(a.id));
      if (pin !== 0) return pin;
      if (sort === 'helpful') return helpfulScore(b, helpfulVotes) - helpfulScore(a, helpfulVotes) || time(b) - time(a);
      if (sort === 'highest') return b.rating - a.rating || time(b) - time(a);
      if (sort === 'lowest') return a.rating - b.rating || time(b) - time(a);
      if (sort === 'photos') return hasPhoto(b) - hasPhoto(a) || time(b) - time(a);
      return time(b) - time(a);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredReviews, ratingFilter, sort, featuredSet]);

  // Back to the first page whenever the shopper changes what they are looking at.
  useEffect(() => {
    setVisibleCount(settings.initialCount);
  }, [ratingFilter, colorFilter, sort, settings.initialCount, productId]);

  const visibleReviews = sortedReviews.slice(0, visibleCount);
  const remaining = Math.max(0, sortedReviews.length - visibleReviews.length);

  // Cards shown on the page itself (popup has the rest).
  const previewReviews = useMemo(
    () =>
      [...reviews]
        .sort(
          (a, b) =>
            Number(featuredSet.has(b.id)) - Number(featuredSet.has(a.id)) ||
            helpfulScore(b, {}) - helpfulScore(a, {}) ||
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        )
        .slice(0, 8),
    [reviews, featuredSet]
  );

  /** One entry point for every tap on the page. */
  const openSheet = (opts?: { focusId?: string; filter?: RatingFilter }) => {
    if (opts?.focusId) {
      setRatingFilter('all');
      setColorFilter(null);
      setVisibleCount(Math.max(reviews.length, settings.initialCount));
      setFocusReviewId(opts.focusId);
    } else {
      setFocusReviewId(null);
      if (opts?.filter) setRatingFilter(opts.filter);
    }
    setSheetOpen(true);
  };

  const closeSheet = () => {
    setSheetOpen(false);
    setFocusReviewId(null);
  };

  const openPhotoOfReview = (reviewId: string, src: string) => {
    const idx = allPhotos.findIndex((p) => p.reviewId === reviewId && p.src === src);
    setLightboxIndex(idx >= 0 ? idx : 0);
  };

  const onPickPhotos = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (picked.length === 0) return;
    setPhotoFiles((prev) => {
      const combined = [...prev, ...picked].slice(0, MAX_PHOTOS);
      if (prev.length + picked.length > MAX_PHOTOS) {
        toast.info(`You can attach up to ${MAX_PHOTOS} photos`);
      }
      return combined;
    });
  };

  useEffect(() => {
    const urls = photoFiles.map((f) => URL.createObjectURL(f));
    setPhotoPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [photoFiles]);

  const removePhoto = (idx: number) => {
    setPhotoFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmitRating = async () => {
    if (rating === 0) {
      toast.error('Please select a star rating');
      return;
    }
    setSubmitting(true);
    try {
      const review = await submitReview({ productId, rating, color: selectedColor || undefined });
      setMyReview(review);
      setStep('details');
      scheduleAutoPublish(review.id, () => {
        setMyReview((prev) => (prev && prev.id === review.id ? { ...prev, is_approved: true } : prev));
        fetchApprovedReviews(productId).then(setReviews).catch(() => {});
      });
      toast.success('Thanks for rating! Add a written review below, or come back anytime.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not submit rating');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitDetails = async () => {
    if (!myReview) return;
    setSubmitting(true);
    try {
      let photos: string[] = [];
      if (photoFiles.length > 0) {
        photos = await Promise.all(photoFiles.map(uploadReviewPhoto));
      }
      const updated = await updateMyReview(myReview.id, { title, comment, photos });
      setMyReview(updated);
      scheduleAutoPublish(updated.id, () => {
        setMyReview((prev) => (prev && prev.id === updated.id ? { ...prev, is_approved: true } : prev));
        fetchApprovedReviews(productId).then(setReviews).catch(() => {});
      });
      setFormOpen(false);
      setTitle('');
      setComment('');
      setPhotoFiles([]);
      toast.success('Thanks! Your review will go live within a few seconds.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not submit review');
    } finally {
      setSubmitting(false);
    }
  };

  const openForm = () => {
    if (!user) {
      toast.info('Login to write a review');
      router.push(`/login?next=/product/${productSlug}`);
      return;
    }
    if (myReview && !hasWrittenContent(myReview)) {
      // Already rated -- go straight to the "add details" step.
      setRating(myReview.rating);
      setStep('details');
    } else {
      setStep('rating');
      setRating(0);
    }
    setFormOpen(true);
    window.setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60);
  };

  // What the "write a review" button should say (null = nothing to offer).
  const writeCta: { label: string; onClick: () => void } | null =
    myReview && hasWrittenContent(myReview)
      ? null
      : myReview
      ? { label: 'Add a written review', onClick: openForm }
      : { label: reviews.length === 0 ? 'Write the first review' : 'Rate this product', onClick: openForm };

  const statusNote =
    myReview && hasWrittenContent(myReview) ? (
      <div className="flex items-center gap-2 rounded-lg border border-emerald-200/60 bg-emerald-50/60 p-3 text-xs font-medium text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300">
        <CheckCircle2 className="h-4 w-4 shrink-0" />
        {myReview.is_approved ? 'You reviewed this product.' : 'Your review is awaiting approval.'}
      </div>
    ) : myReview ? (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <CheckCircle2 className="h-4 w-4 shrink-0 text-secondary" />
        You rated this {myReview.rating}★{myReview.is_approved ? '' : ' (awaiting approval)'}
      </div>
    ) : null;

  const galleryTiles = allPhotos.slice(0, 4);
  const hiddenPhotoCount = Math.max(0, allPhotos.length - 3);

  return (
    <div className="flex flex-col gap-5">
      {/* ---------- Heading ---------- */}
      <button
        type="button"
        onClick={() => reviews.length > 0 && openSheet()}
        className="flex w-full items-center justify-between text-left"
      >
        <h3 className="font-serif text-xl font-bold text-foreground">Ratings &amp; Reviews</h3>
        {reviews.length > 0 && <ChevronRight className="h-5 w-5 text-muted-foreground lg:hidden" />}
      </button>

      <div className="grid gap-5 lg:grid-cols-[320px_1fr] lg:gap-8">
        {/* ---------- Left: summary + photos + CTA ---------- */}
        <div className="flex min-w-0 flex-col gap-4 lg:rounded-3xl lg:border lg:border-border/60 lg:bg-card lg:p-5 lg:shadow-[0_2px_24px_-12px_rgba(0,0,0,0.1)]">
          {loading ? (
            <Skeleton className="h-12 w-full rounded-xl" />
          ) : reviews.length > 0 ? (
            <>
              {/* Mobile: badge + count pill */}
              <button
                type="button"
                onClick={() => openSheet()}
                className="flex w-full items-center gap-3 text-left lg:hidden"
              >
                <span className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-base font-bold text-white ${ratingTone(summary.average)}`}>
                  {summary.average.toFixed(1)}
                  <Star className="h-4 w-4 fill-white" />
                </span>
                <span className="flex items-center gap-1.5 rounded-xl bg-muted px-3 py-2 text-xs font-medium text-foreground/80">
                  {summary.totalRatings.toLocaleString('en-IN')} rating{summary.totalRatings === 1 ? '' : 's'}
                  <span className="text-muted-foreground/50">|</span>
                  {summary.totalReviews.toLocaleString('en-IN')} review{summary.totalReviews === 1 ? '' : 's'}
                  <ChevronRight className="h-3.5 w-3.5" />
                </span>
              </button>

              {/* Desktop: big number + clickable bars */}
              <div className="hidden flex-col gap-4 lg:flex">
                <button type="button" onClick={() => openSheet()} className="flex items-end gap-3 text-left">
                  <p className="font-serif text-5xl font-bold leading-none text-primary">{summary.average.toFixed(1)}</p>
                  <div className="flex flex-col gap-1 pb-0.5">
                    <StarRow value={summary.average} size="h-4 w-4" />
                    <p className="text-xs font-medium text-muted-foreground">
                      {summary.totalRatings.toLocaleString('en-IN')} Rating{summary.totalRatings === 1 ? '' : 's'} ·{' '}
                      {summary.totalReviews.toLocaleString('en-IN')} Review{summary.totalReviews === 1 ? '' : 's'}
                    </p>
                  </div>
                </button>
                <RatingBars
                  breakdown={summary.breakdown as unknown as Record<number, number>}
                  total={summary.totalRatings}
                  onPick={(f) => openSheet({ filter: f })}
                />
              </div>

              {/* Photo strip: 3 photos + "+N" tile */}
              {settings.showPhotoGallery && allPhotos.length > 0 && (
                <div className="grid grid-cols-4 gap-2">
                  {galleryTiles.map((ph, i) => {
                    const isLast = i === 3 && hiddenPhotoCount > 0;
                    return (
                      <button
                        key={`${ph.reviewId}-${i}`}
                        type="button"
                        onClick={() => openSheet()}
                        aria-label={isLast ? `See ${hiddenPhotoCount} more photos` : `Open customer photo ${i + 1}`}
                        className="relative aspect-square overflow-hidden rounded-xl border border-border/60 transition-transform active:scale-95"
                      >
                        <PhotoThumb src={ph.src} alt={`Customer photo ${i + 1}`} className="h-full w-full object-cover" />
                        {isLast && (
                          <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-base font-semibold text-white backdrop-blur-[1px]">
                            +{hiddenPhotoCount}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">No reviews yet. Be the first to share your experience.</p>
          )}

          {statusNote}

          {writeCta && (
            <Button
              onClick={writeCta.onClick}
              className="w-full bg-gradient-to-r from-primary via-primary to-primary/90 text-primary-foreground shadow-sm transition-transform hover:scale-[1.01] hover:shadow-md"
            >
              <Star className="mr-1.5 h-4 w-4 fill-secondary text-secondary" />
              {writeCta.label}
            </Button>
          )}

          {user && !myReview && !eligible && (
            <p className="text-xs leading-relaxed text-muted-foreground">
              Only customers who have purchased this product can leave a review.
            </p>
          )}
        </div>

        {/* ---------- Right: customer reviews preview ---------- */}
        <div className="flex min-w-0 flex-col gap-4">
          {formOpen && (
            <div ref={formRef} className="rounded-2xl border border-border/60 bg-card p-5">
              {step === 'rating' ? (
                <>
                  <p className="mb-2 text-sm font-semibold">Rate this product</p>
                  <p className="mb-3 text-xs text-muted-foreground">
                    Just tap a star to submit your rating. You can add a written review after, if you&apos;d like.
                  </p>
                  <StarPicker value={rating} onChange={setRating} />
                  <div className="mt-4 flex gap-2">
                    <Button onClick={handleSubmitRating} disabled={submitting} className="bg-primary">
                      {submitting ? (
                        <>
                          <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                          Submitting...
                        </>
                      ) : (
                        'Submit Rating'
                      )}
                    </Button>
                    <Button variant="ghost" onClick={() => setFormOpen(false)}>
                      Cancel
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <p className="mb-1 text-sm font-semibold">Write a review</p>
                  <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
                    <StarRow value={myReview?.rating ?? rating} size="h-3.5 w-3.5" />
                    Your rating &mdash; already saved
                  </div>
                  <Input
                    placeholder="Review title (optional)"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    maxLength={100}
                  />
                  <Textarea
                    className="mt-3"
                    placeholder="Share details about the fit, fabric, and quality..."
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    rows={4}
                    maxLength={1000}
                  />

                  <div className="mt-3">
                    <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                      Add photos (optional) — {photoFiles.length}/{MAX_PHOTOS}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {photoPreviews.map((src, idx) => (
                        <div key={idx} className="relative h-16 w-16 overflow-hidden rounded-md border border-border/60">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={src} alt={`Attached photo ${idx + 1}`} className="h-full w-full object-cover" />
                          <button
                            type="button"
                            onClick={() => removePhoto(idx)}
                            className="absolute right-0.5 top-0.5 rounded-full bg-background/90 p-0.5 text-destructive shadow-sm hover:bg-background"
                            aria-label="Remove photo"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                      {photoFiles.length < MAX_PHOTOS && (
                        <label className="flex h-16 w-16 cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border text-muted-foreground hover:border-primary/40 hover:text-primary">
                          <ImagePlus className="h-5 w-5" />
                          <span className="text-[10px]">Add</span>
                          <input type="file" accept="image/*" multiple className="hidden" onChange={onPickPhotos} />
                        </label>
                      )}
                    </div>
                  </div>

                  <div className="mt-3 flex gap-2">
                    <Button onClick={handleSubmitDetails} disabled={submitting} className="bg-primary">
                      {submitting ? (
                        <>
                          <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                          Submitting...
                        </>
                      ) : (
                        'Submit Review'
                      )}
                    </Button>
                    <Button variant="ghost" onClick={() => setFormOpen(false)}>
                      Maybe later
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}

          {loading ? (
            <div className="flex gap-3 overflow-hidden">
              {Array.from({ length: 2 }).map((_, i) => (
                <Skeleton key={i} className="h-36 w-[86%] shrink-0 rounded-2xl lg:w-full" />
              ))}
            </div>
          ) : reviews.length > 0 ? (
            <>
              <div className="flex items-center justify-between gap-3">
                <h4 className="text-sm font-semibold text-foreground">Customer Reviews ({summary.totalReviews || reviews.length})</h4>
                <button
                  type="button"
                  onClick={() => openSheet()}
                  className="text-sm font-semibold text-primary underline underline-offset-4"
                >
                  View All
                </button>
              </div>

              <ul className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0 lg:grid lg:grid-cols-2 lg:overflow-visible [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:[&>li:nth-child(n+5)]:hidden">
                {previewReviews.map((r) => (
                  <ReviewPreviewCard key={r.id} r={r} onOpen={() => openSheet({ focusId: r.id })} />
                ))}
              </ul>

              <Button
                type="button"
                variant="outline"
                onClick={() => openSheet()}
                className="hidden w-full rounded-full border-primary/40 font-semibold text-primary hover:bg-primary/5 lg:inline-flex"
              >
                View all {reviews.length} review{reviews.length === 1 ? '' : 's'}
              </Button>
            </>
          ) : null}
        </div>
      </div>

      {sheetOpen && (
        <ReviewsSheet
          onClose={closeSheet}
          suspendKeys={lightboxIndex !== null}
          summary={summary}
          loading={loading}
          settings={settings}
          allPhotos={allPhotos}
          featuredSet={featuredSet}
          ratingFilter={ratingFilter}
          setRatingFilter={setRatingFilter}
          chipCounts={chipCounts}
          sort={sort}
          setSort={setSort}
          colorOptions={colorOptions}
          colorFilter={colorFilter}
          setColorFilter={setColorFilter}
          selectedColor={selectedColor}
          totalForColors={reviews.length}
          colorCount={(color) => reviews.filter((r) => r.variant_color?.trim().toLowerCase() === color.toLowerCase()).length}
          sortedReviews={sortedReviews}
          visibleReviews={visibleReviews}
          remaining={remaining}
          onLoadMore={() => setVisibleCount((c) => c + settings.loadMoreCount)}
          markedHelpful={markedHelpful}
          helpfulVotes={helpfulVotes}
          toggleHelpful={toggleHelpful}
          onOpenPhotoAt={(i) => setLightboxIndex(i)}
          onOpenReviewPhoto={openPhotoOfReview}
          focusReviewId={focusReviewId}
          writeCta={
            writeCta
              ? {
                  label: writeCta.label,
                  onClick: () => {
                    closeSheet();
                    writeCta.onClick();
                  },
                }
              : null
          }
          onClearFilters={() => {
            setRatingFilter('all');
            setColorFilter(null);
          }}
        />
      )}

      {lightboxIndex !== null && allPhotos.length > 0 && (
        <PhotoLightbox
          items={allPhotos}
          index={Math.min(lightboxIndex, allPhotos.length - 1)}
          onIndex={setLightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </div>
  );
}
