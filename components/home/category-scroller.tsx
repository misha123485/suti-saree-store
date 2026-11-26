'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Horizontal scroller for the home "Shop by Category" grid. The category
 * cards themselves stay server-rendered (passed as children); this only
 * adds a slim progress bar + a "Swipe" nudge so shoppers can tell there
 * are more categories to slide to. Passive scroll listener, no re-render
 * unless the thumb actually moves.
 */
export default function CategoryScroller({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [m, setM] = useState({ thumb: 1, pos: 0, overflow: false });
  const [touched, setTouched] = useState(false);

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    const overflow = max > 4;
    const thumb = overflow ? Math.max(0.15, el.clientWidth / el.scrollWidth) : 1;
    const pos = overflow ? Math.min(1, Math.max(0, el.scrollLeft / max)) : 0;
    setM((p) =>
      Math.abs(p.pos - pos) < 0.005 && p.overflow === overflow && Math.abs(p.thumb - thumb) < 0.005
        ? p
        : { thumb, pos, overflow },
    );
  }, []);

  useEffect(() => {
    measure();
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure]);

  return (
    <div>
      <div
        ref={ref}
        onScroll={() => {
          measure();
          if (!touched) setTouched(true);
        }}
        className={className}
      >
        {children}
      </div>
      {/* fixed height so nothing jumps when the hint appears */}
      <div className="flex h-7 flex-col items-center justify-center gap-1" aria-hidden="true">
        {m.overflow && (
          <>
            <div className="relative h-[3px] w-20 rounded-full bg-primary/15">
              <span
                className="absolute top-0 h-full rounded-full bg-primary"
                style={{ width: `${m.thumb * 100}%`, left: `${m.pos * (1 - m.thumb) * 100}%` }}
              />
            </div>
            <span
              className={`text-[10px] font-medium tracking-wide text-muted-foreground transition-opacity ${touched ? 'opacity-0' : 'animate-pulse opacity-100'}`}
            >
              Swipe to see more ›
            </span>
          </>
        )}
      </div>
    </div>
  );
}
