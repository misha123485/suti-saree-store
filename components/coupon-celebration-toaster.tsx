'use client';

import { useEffect, useState } from 'react';
import { toast, Toaster as SonnerToaster } from 'sonner';
import './coupon-celebration.css';

/**
 * Drop-in replacement for sonner's <Toaster />.
 *
 *  - Silences the "Coupon "CODE" applied" toast popup everywhere in the
 *    store (checkout, product page, resume checkout, ...). Every other toast
 *    works exactly as before.
 *  - Shows a quick CSS-only celebration instead (confetti + a "coupon
 *    applied" chip). transform/opacity only, ~1.8s, no animation library.
 */

const COUPON_APPLIED = /^Coupon "(.+)" applied$/;
const EVENT = 'store:coupon-applied';

type PatchedToast = typeof toast & { __couponPatched?: boolean };

// Wrap toast.success once, before any component can call it.
const t = toast as PatchedToast;
if (typeof window !== 'undefined' && !t.__couponPatched) {
  const original = toast.success.bind(toast);
  (toast as { success: typeof toast.success }).success = ((message, data) => {
    if (typeof message === 'string') {
      const m = COUPON_APPLIED.exec(message);
      if (m) {
        window.dispatchEvent(new CustomEvent(EVENT, { detail: { code: m[1] } }));
        return undefined as unknown as string | number;
      }
    }
    return original(message, data);
  }) as typeof toast.success;
  t.__couponPatched = true;
}

// [x px, y px, rotation deg, color, delay ms]
const CONFETTI: Array<[number, number, number, string, number]> = [
  [-150, 40, 200, '#f59e0b', 0],
  [-115, 70, -160, '#ec4899', 30],
  [-80, 55, 120, '#10b981', 10],
  [-45, 85, -220, '#6366f1', 50],
  [-15, 65, 180, '#f59e0b', 0],
  [15, 90, -140, '#ec4899', 40],
  [45, 60, 240, '#10b981', 20],
  [80, 80, -200, '#6366f1', 60],
  [115, 50, 160, '#f59e0b', 15],
  [150, 75, -120, '#10b981', 70],
  [-130, 100, 140, '#ec4899', 55],
  [130, 105, -250, '#6366f1', 35],
  [-60, 115, 260, '#f59e0b', 80],
  [60, 110, -180, '#ec4899', 25],
];

function CouponCelebration() {
  const [state, setState] = useState<{ key: number; code: string } | null>(null);

  useEffect(() => {
    let n = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onApplied = (e: Event) => {
      const code = (e as CustomEvent<{ code: string }>).detail?.code ?? '';
      n += 1;
      setState({ key: n, code });
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setState(null), 1900);
    };
    window.addEventListener(EVENT, onApplied);
    return () => {
      window.removeEventListener(EVENT, onApplied);
      if (timer) clearTimeout(timer);
    };
  }, []);

  if (!state) return null;

  return (
    <div
      key={state.key}
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-[72px] z-[100] h-0"
    >
      <div className="absolute left-1/2 top-4 h-0 w-0" aria-hidden>
        {CONFETTI.map(([x, y, r, color, delay], i) => (
          <span
            key={i}
            className="cc-confetti absolute block h-1.5 w-2 rounded-[1px]"
            style={
              {
                backgroundColor: color,
                animationDelay: `${delay}ms`,
                '--cx': `${x}px`,
                '--cy': `${y}px`,
                '--cr': `${r}deg`,
              } as React.CSSProperties
            }
          />
        ))}
      </div>
      <div className="cc-chip absolute left-1/2 top-0 max-w-[92vw] overflow-hidden whitespace-nowrap rounded-full bg-green-600 px-4 py-2 text-sm font-semibold text-white shadow-lg">
        🎉 &ldquo;{state.code}&rdquo; applied — enjoy your savings!
        <span aria-hidden className="cc-shine absolute inset-y-0 left-0 w-1/3" />
      </div>
    </div>
  );
}

export function Toaster(props: React.ComponentProps<typeof SonnerToaster>) {
  return (
    <>
      <SonnerToaster {...props} />
      <CouponCelebration />
    </>
  );
}
