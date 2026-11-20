'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';

// Mobile-only sticky + clickable checkout progress capsule:
//   Contact · Address · Delivery · Payment
// - Sits right under the "You're saving" bar and sticks just below the site header.
// - Tap a step to smooth-scroll to that section.
// - The current step (by scroll position) is the maroon pill; a step turns green
//   with a tick only when its details are really filled (done flags come from the page).
// - Works on every phone width (labels shrink on very small screens, never wrap).

export type CheckoutStepKey = 'contact' | 'address' | 'delivery' | 'payment';

type Props = {
  done: Record<CheckoutStepKey, boolean>;
};

// Each step looks for the first element id that exists on the page.
// `checkout-step-details` is the combined card shown to logged-in customers
// with a saved address (Contact + Address live in that one card).
const STEPS: { key: CheckoutStepKey; label: string; ids: string[] }[] = [
  { key: 'contact', label: 'Contact', ids: ['checkout-step-contact', 'checkout-step-details'] },
  { key: 'address', label: 'Address', ids: ['checkout-step-address', 'checkout-step-details'] },
  { key: 'delivery', label: 'Delivery', ids: ['checkout-step-delivery', 'checkout-step-payment'] },
  { key: 'payment', label: 'Payment', ids: ['checkout-step-payment'] },
];

function findTarget(ids: string[]): HTMLElement | null {
  for (const id of ids) {
    const el = document.getElementById(id);
    // Skip elements that are not on screen (e.g. page hidden behind the bottom sheet).
    if (el && el.getBoundingClientRect().height > 0) return el;
  }
  return null;
}

export default function CheckoutStepsBar({ done }: Props) {
  const barRef = useRef<HTMLDivElement>(null);
  const [headerH, setHeaderH] = useState(48);
  const [active, setActive] = useState<CheckoutStepKey>('contact');
  const rafRef = useRef(0);

  // Offset = site header + this bar + a little breathing space.
  const getOffset = useCallback(() => {
    const header = document.querySelector('header');
    const h = header ? header.getBoundingClientRect().height : headerH;
    const b = barRef.current ? barRef.current.getBoundingClientRect().height : 40;
    return Math.round(h + b + 10);
  }, [headerH]);

  // Keep the sticky `top` equal to the real header height (it changes with the
  // order bar / safe areas / orientation).
  useEffect(() => {
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
  }, []);

  // Scroll-spy: the last step whose section top has passed the offset line.
  const spy = useCallback(() => {
    const offset = getOffset();
    let current: CheckoutStepKey = 'contact';
    for (const s of STEPS) {
      const el = findTarget(s.ids);
      if (el && el.getBoundingClientRect().top - offset <= 24) current = s.key;
    }
    const doc = document.documentElement;
    if (window.scrollY + window.innerHeight >= doc.scrollHeight - 4) current = 'payment';
    setActive(current);
  }, [getOffset]);

  useEffect(() => {
    const onScroll = () => {
      if (rafRef.current) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = 0;
        spy();
      });
    };
    spy();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [spy]);

  const goTo = (ids: string[]) => {
    const el = findTarget(ids);
    if (!el) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const top = el.getBoundingClientRect().top + window.scrollY - getOffset() + 4;
    window.scrollTo({ top: Math.max(0, top), behavior: reduce ? 'auto' : 'smooth' });
  };

  return (
    <div
      ref={barRef}
      style={{ top: headerH }}
      className="sticky z-30 -mx-4 mb-2 bg-background px-2.5 pb-1 pt-1.5 sm:mx-0 md:hidden"
    >
      <nav
        aria-label="Checkout progress"
        className="flex gap-px rounded-full border border-secondary/40 bg-card p-0.5"
      >
        {STEPS.map((s) => {
          const isActive = active === s.key;
          const isDone = done[s.key];
          const tone = isActive
            ? isDone
              ? 'bg-primary text-green-200 font-semibold'
              : 'bg-primary text-[#f6e7b8] font-semibold'
            : isDone
              ? 'bg-[#e6f4ea] text-[#1b6e3c] font-medium'
              : 'text-muted-foreground';
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => goTo(s.ids)}
              aria-current={isActive ? 'step' : undefined}
              className={`flex h-8 min-w-0 flex-1 items-center justify-center gap-0.5 whitespace-nowrap rounded-full px-0.5 text-[10px] uppercase tracking-normal transition-colors duration-200 [-webkit-tap-highlight-color:transparent] motion-reduce:transition-none min-[360px]:gap-1 min-[360px]:text-[11px] min-[360px]:tracking-wide ${tone}`}
            >
              {isDone && <Check className="h-3 w-3 shrink-0" strokeWidth={3} aria-hidden="true" />}
              <span className="truncate">{s.label}</span>
              {isDone && <span className="sr-only">(completed)</span>}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
