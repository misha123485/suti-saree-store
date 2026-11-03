'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Renders `children` only once the placeholder is near the viewport.
 *
 * Used with next/dynamic on the product page so that below-the-fold
 * sections (reviews, related products, ...) neither download nor
 * hydrate their JS until the shopper scrolls close to them. This cuts
 * initial JS / Total Blocking Time. Falls back to rendering immediately
 * when IntersectionObserver isn't available.
 */
export default function LazyOnView({
  children,
  minHeight = 200,
  rootMargin = '600px 0px',
  className,
}: {
  children: ReactNode;
  minHeight?: number;
  rootMargin?: string;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (visible) return;
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [visible, rootMargin]);

  return (
    <div ref={ref} className={className} style={visible ? undefined : { minHeight }}>
      {visible ? children : null}
    </div>
  );
}
