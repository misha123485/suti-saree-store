'use client';

import { useEffect, useState } from 'react';

/**
 * true  -> the shopper is scrolling DOWN (hide the bar)
 * false -> scrolling UP, or near the top of the page (show the bar)
 *
 * `threshold` ignores tiny jitters; `topOffset` keeps the bar visible while
 * the page is still near the top.
 */
export function useScrollHide(threshold = 10, topOffset = 120): boolean {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let lastY = window.scrollY;
    let ticking = false;

    const update = () => {
      const y = window.scrollY;
      if (y < topOffset) {
        setHidden(false);
      } else if (y - lastY > threshold) {
        setHidden(true);
      } else if (lastY - y > threshold) {
        setHidden(false);
      } else {
        ticking = false;
        return; // too small a move -- keep lastY so slow scrolls still add up
      }
      lastY = y;
      ticking = false;
    };

    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [threshold, topOffset]);

  return hidden;
}
