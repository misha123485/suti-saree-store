'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { fetchSiteBanner, type SiteBanner as SiteBannerSettings } from '@/lib/settings-api';
import { normalizeSiteBanner } from '@/lib/site-banner';
import { toPublicMediaUrl } from '@/lib/media-url';

// Fixed (not random) positions so server and client render identical markup (no hydration mismatch).
// x / y are percentages of the banner, s = size in px, d = seconds, t = start delay in seconds.
const SNOW = [
  { x: 3, s: 3, d: 7, t: 0, dx: 10 }, { x: 10, s: 2, d: 9, t: 2.5, dx: -8 },
  { x: 17, s: 4, d: 8, t: 4, dx: 12 }, { x: 25, s: 2, d: 10, t: 1, dx: -10 },
  { x: 33, s: 3, d: 7.5, t: 5, dx: 8 }, { x: 41, s: 2, d: 9.5, t: 3, dx: -6 },
  { x: 49, s: 3, d: 8.5, t: 6, dx: 10 }, { x: 57, s: 2, d: 7, t: 1.5, dx: -12 },
  { x: 65, s: 4, d: 9, t: 3.5, dx: 8 }, { x: 73, s: 2, d: 8, t: 0.5, dx: -8 },
  { x: 81, s: 3, d: 10, t: 4.5, dx: 12 }, { x: 89, s: 2, d: 7.5, t: 2, dx: -10 },
  { x: 96, s: 3, d: 8.5, t: 5.5, dx: 6 },
];
const SPARKLES = [
  { x: 6, y: 28, s: 9, t: 0 }, { x: 14, y: 68, s: 7, t: 1.1 }, { x: 22, y: 18, s: 6, t: 2.2 },
  { x: 78, y: 22, s: 7, t: 0.6 }, { x: 87, y: 64, s: 9, t: 1.7 }, { x: 94, y: 30, s: 6, t: 2.6 },
];

/**
 * Promotional banner (set from Admin > Settings > Site Banner). Shows on
 * every page EXCEPT checkout, with one carve-out: the home page and
 * individual product pages are each gated by their own toggle ("Show on
 * home page" / "Show on product page"). Every other page (shop, category,
 * etc.) always shows the banner whenever at least one slide is enabled.
 *
 * The banner can hold several slides. Admin controls which slides are
 * enabled, whether the slider loops, how long each slide stays on screen,
 * and the desktop / mobile height (natural image height by default, or a
 * fixed pixel height per device).
 */
export default function SiteBanner({ initialBanner }: { initialBanner?: SiteBannerSettings }) {
  const pathname = usePathname();
  // `initialBanner` is read on the server (app/layout.tsx), so the banner is
  // already in the first HTML -- it doesn't pop in after hydration and push
  // the page down. The client fetch below only runs as a fallback if this
  // component is ever mounted without it.
  const [banner, setBanner] = useState<SiteBannerSettings>(() => normalizeSiteBanner(initialBanner));

  useEffect(() => {
    if (initialBanner) return;
    fetchSiteBanner()
      .then(setBanner)
      .catch(() => {});
  }, [initialBanner]);

  const slides = useMemo(() => (banner.slides ?? []).filter((s) => s.enabled && s.image_url), [banner.slides]);
  const count = slides.length;
  const loop = banner.loop !== false;
  const autoplay = banner.autoplay !== false;
  const intervalMs = Math.max(2, banner.interval_seconds ?? 5) * 1000;

  const [index, setIndex] = useState(0);
  // Bumped when a tick fires while paused (hover/touch) so the timer re-arms.
  const [tick, setTick] = useState(0);
  const pausedRef = useRef(false);
  const touchStartX = useRef<number | null>(null);

  // Keep the index valid if slides get disabled/removed.
  useEffect(() => {
    if (index > count - 1) setIndex(0);
  }, [count, index]);

  const goTo = useCallback(
    (next: number) => {
      if (count <= 1) return;
      if (next < 0) setIndex(loop ? count - 1 : 0);
      else if (next > count - 1) setIndex(loop ? 0 : count - 1);
      else setIndex(next);
    },
    [count, loop]
  );

  // Auto-slide. Without "loop" it stops on the last slide.
  useEffect(() => {
    if (!autoplay || count <= 1) return;
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    if (!loop && index >= count - 1) return;
    const t = window.setTimeout(() => {
      if (!pausedRef.current) goTo(index + 1);
      else setTick((n) => n + 1);
    }, intervalMs);
    return () => window.clearTimeout(t);
  }, [autoplay, count, index, intervalMs, loop, goTo, tick]);

  // Sticky mode: the storefront header is `sticky top-0` and its height changes (mobile / desktop,
  // search open...), so measure it and park the banner right under it.
  const isSticky = !!banner.sticky;
  const [headerH, setHeaderH] = useState(0);
  useEffect(() => {
    if (!isSticky) return;
    const header = document.querySelector('header');
    if (!header) return;
    const update = () => setHeaderH(Math.round(header.getBoundingClientRect().height));
    update();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    ro?.observe(header);
    window.addEventListener('resize', update);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [isSticky]);

  const isCheckout = pathname?.startsWith('/checkout');
  const isHome = pathname === '/';
  const isProduct = pathname?.startsWith('/product/');
  // Home/product are toggle-gated; every other non-checkout page keeps
  // the original always-on behavior.
  const allowedHere = isHome ? !!banner.show_on_home : isProduct ? !!banner.show_on_product : !isCheckout;

  if (count === 0 || !allowedHere) return null;

  const mFixed = banner.mobile_size_mode === 'fixed';
  const dFixed = banner.desktop_size_mode === 'fixed';
  // Static class strings so Tailwind can see them.
  const boxCls = `${mFixed ? 'h-[var(--sb-m)]' : 'h-auto'} ${dFixed ? 'md:h-[var(--sb-d)]' : 'md:h-auto'}`;
  const fillCls = `${mFixed ? 'h-full' : 'h-auto'} ${dFixed ? 'md:h-full' : 'md:h-auto'}`;
  const fitCls = `${mFixed ? 'object-cover' : 'object-contain'} ${dFixed ? 'md:object-cover' : 'md:object-contain'}`;
  const sizeVars = {
    '--sb-m': `${banner.mobile_height ?? 160}px`,
    '--sb-d': `${banner.desktop_height ?? 400}px`,
    ...(isSticky ? { top: headerH } : {}),
  } as React.CSSProperties;

  const fxShine = !!banner.fx_shine;
  const fxFestive = !!banner.fx_festive;

  const showControls = count > 1 && banner.show_controls !== false;
  const canPrev = loop || index > 0;
  const canNext = loop || index < count - 1;

  return (
    <div
      className={`group w-full overflow-hidden ${isSticky ? 'sticky z-30' : 'relative'} ${boxCls}`}
      style={sizeVars}
      onMouseEnter={() => (pausedRef.current = true)}
      onMouseLeave={() => (pausedRef.current = false)}
      onTouchStart={(e) => {
        pausedRef.current = true;
        touchStartX.current = e.touches[0].clientX;
      }}
      onTouchEnd={(e) => {
        pausedRef.current = false;
        const start = touchStartX.current;
        touchStartX.current = null;
        if (start == null) return;
        const dx = e.changedTouches[0].clientX - start;
        if (Math.abs(dx) > 40) goTo(index + (dx < 0 ? 1 : -1));
      }}
    >
      <div
        className={`flex w-full items-start transition-transform duration-500 ease-out ${fillCls}`}
        style={{ transform: `translateX(-${index * 100}%)` }}
      >
        {slides.map((slide, i) => {
          const img = (
            <Image
              src={toPublicMediaUrl(slide.image_url) || slide.image_url}
              alt="Promotional banner"
              width={1600}
              height={400}
              sizes="100vw"
              priority={i === 0}
              loading={i === 0 ? undefined : 'lazy'}
              className={`w-full ${fillCls} ${fitCls}`}
              draggable={false}
            />
          );
          return (
            <div
              key={slide.id}
              className={`w-full flex-none ${fillCls}`}
              aria-hidden={i !== index}
            >
              {slide.link_url ? (
                <Link href={slide.link_url} className={`block ${fillCls}`} tabIndex={i === index ? 0 : -1}>
                  {img}
                </Link>
              ) : (
                img
              )}
            </div>
          );
        })}
      </div>

      {/* Decorative, CSS-only effects (transform/opacity only). Hidden for prefers-reduced-motion in globals.css. */}
      {(fxShine || fxFestive) && (
        <div className="sb-fx pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
          {fxShine && <span className="sb-shine" />}
          {fxFestive &&
            SNOW.map((f, i) => (
              <span
                key={`f${i}`}
                className="sb-flake"
                style={
                  {
                    '--x': `${f.x}%`,
                    '--s': `${f.s}px`,
                    '--d': `${f.d}s`,
                    '--t': `${f.t}s`,
                    '--dx': `${f.dx}px`,
                  } as React.CSSProperties
                }
              />
            ))}
          {fxFestive &&
            SPARKLES.map((p, i) => (
              <span
                key={`p${i}`}
                className="sb-spark"
                style={
                  { '--x': `${p.x}%`, '--y': `${p.y}%`, '--s': `${p.s}px`, '--t': `${p.t}s` } as React.CSSProperties
                }
              />
            ))}
        </div>
      )}

      {showControls && (
        <>
          <button
            type="button"
            aria-label="Previous banner"
            onClick={() => goTo(index - 1)}
            disabled={!canPrev}
            className="absolute left-2 top-1/2 hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/35 text-white opacity-0 transition hover:bg-black/55 focus-visible:opacity-100 disabled:hidden group-hover:opacity-100 md:flex"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            aria-label="Next banner"
            onClick={() => goTo(index + 1)}
            disabled={!canNext}
            className="absolute right-2 top-1/2 hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/35 text-white opacity-0 transition hover:bg-black/55 focus-visible:opacity-100 disabled:hidden group-hover:opacity-100 md:flex"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
          <div className="pointer-events-none absolute inset-x-0 bottom-1.5 flex justify-center gap-1.5">
            {slides.map((s, i) => (
              <button
                key={s.id}
                type="button"
                aria-label={`Go to banner ${i + 1}`}
                onClick={() => goTo(i)}
                className={`pointer-events-auto h-1.5 rounded-full transition-all ${
                  i === index ? 'w-4 bg-white' : 'w-1.5 bg-white/60'
                }`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
