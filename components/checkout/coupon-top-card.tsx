'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, ChevronRight, Loader2, Tag } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { formatINR } from '@/lib/format';
import './coupon-top-card.css';

/**
 * Coupon card at the TOP of checkout.
 *
 *  - Manual "Enter coupon code" box with the Apply button INSIDE the box.
 *  - Coupons marked "Show on checkout" in Admin > Coupons are listed here
 *    with their own Apply button.
 *  - Once a coupon is applied: green "You saved ₹X" strip + `"CODE" applied`
 *    row with Remove, plus a quick CSS-only celebration (no toast popup).
 *  - "View all coupons & Offers" expands the full list.
 *
 * Self-contained: it fetches the checkout coupons itself and only needs the
 * apply/remove callbacks from the page.
 */

type CheckoutCoupon = {
  id: string;
  code: string;
  discount_type: 'percentage' | 'flat';
  discount_value: number;
  min_order_value: number;
  usage_limit: number | null;
  times_used: number;
  expires_at: string | null;
};

type Props = {
  appliedCode: string | null;
  /** Rupees saved by the applied coupon (shown in the green strip). */
  couponSavings: number;
  /** Should validate + apply the code (e.g. cart-context applyCoupon). */
  onApply: (code: string) => Promise<{ ok: boolean; error?: string }>;
  onRemove: () => void;
  /** If given, "View all coupons & Offers" calls this (e.g. opens your existing
   *  Coupons & Offers sheet) instead of expanding a list inside the card. */
  onViewAll?: () => void;
  /** Optional bar shown flush on top of the card (e.g. "You're saving ₹X on this order"). */
  topBanner?: React.ReactNode;
};

// [x px, y px, rotation deg, color, delay ms]
const CONFETTI: Array<[number, number, number, string, number]> = [
  [-120, -34, 200, '#f59e0b', 0],
  [-90, -52, -160, '#ec4899', 30],
  [-60, -40, 120, '#10b981', 10],
  [-30, -58, -220, '#6366f1', 50],
  [0, -64, 180, '#f59e0b', 0],
  [30, -56, -140, '#ec4899', 40],
  [60, -42, 240, '#10b981', 20],
  [90, -50, -200, '#6366f1', 60],
  [120, -36, 160, '#f59e0b', 15],
  [-105, -14, -120, '#10b981', 70],
  [105, -12, 140, '#ec4899', 55],
  [-45, -26, 260, '#f59e0b', 80],
  [45, -24, -250, '#6366f1', 35],
];

async function fetchCheckoutCoupons(): Promise<CheckoutCoupon[]> {
  const { data, error } = await supabase
    .from('coupons')
    .select('*')
    .eq('is_active', true)
    .eq('show_on_checkout', true)
    .order('discount_value', { ascending: false });
  if (error) throw error;
  const now = Date.now();
  return ((data ?? []) as CheckoutCoupon[]).filter(
    (c) =>
      (!c.expires_at || new Date(c.expires_at).getTime() > now) &&
      (c.usage_limit === null || c.times_used < c.usage_limit)
  );
}

const offerLabel = (c: CheckoutCoupon) =>
  c.discount_type === 'percentage' ? `${c.discount_value}%` : formatINR(c.discount_value);

export function CouponTopCard({ appliedCode, couponSavings, onApply, onRemove, onViewAll, topBanner }: Props) {
  const [coupons, setCoupons] = useState<CheckoutCoupon[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState<string | null>(null); // code being applied
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [celebrateKey, setCelebrateKey] = useState(0);
  const prevCode = useRef<string | null>(appliedCode);

  useEffect(() => {
    let cancelled = false;
    fetchCheckoutCoupons()
      .then((c) => {
        if (!cancelled) setCoupons(c);
      })
      .catch(() => {
        /* column missing / offline: just show the manual box */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Celebrate whenever the applied coupon changes to a (new) code
  // (a coupon that was already on when the page loaded does not celebrate).
  useEffect(() => {
    if (appliedCode && appliedCode !== prevCode.current) {
      setCelebrateKey((k) => k + 1);
      setShowAll(false);
    }
    prevCode.current = appliedCode;
  }, [appliedCode]);

  const apply = async (rawCode: string, fromInput: boolean) => {
    const code = rawCode.trim();
    if (!code || busy) return;
    setError(null);
    setBusy(code);
    try {
      const res = await onApply(code);
      if (!res.ok) setError(res.error || 'Invalid coupon');
      else if (fromInput) setInput('');
    } finally {
      setBusy(null);
    }
  };

  const best = coupons.find((c) => c.code.toUpperCase() !== appliedCode?.toUpperCase());
  const manualBusy = busy !== null && busy === input.trim();

  const renderRow = (c: CheckoutCoupon, isApplied: boolean) => (
    <div
      key={c.id}
      className="flex items-center justify-between gap-3 rounded-lg border border-dashed border-secondary/60 bg-secondary/10 px-3 py-2.5"
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm font-bold tracking-wide text-primary">{c.code}</span>
          <span className="text-xs font-semibold text-secondary-foreground">{offerLabel(c)} OFF</span>
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {c.min_order_value > 0 ? `On orders above ${formatINR(c.min_order_value)}` : 'No minimum order value'}
        </p>
      </div>
      {isApplied ? (
        <span className="shrink-0 text-xs font-semibold text-green-700">Applied</span>
      ) : (
        <button
          type="button"
          onClick={() => apply(c.code, false)}
          disabled={busy !== null}
          className="shrink-0 rounded-md border border-primary bg-background px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary hover:text-primary-foreground disabled:opacity-60"
        >
          {busy === c.code ? 'Applying…' : 'Apply'}
        </button>
      )}
    </div>
  );

  return (
    <div className="relative mb-4 rounded-lg border border-border/60 bg-card">
      {topBanner}

      {/* You saved ₹X */}
      {appliedCode && couponSavings > 0 && (
        <div
          key={`strip-${celebrateKey}`}
          className={`coupon-strip relative overflow-hidden ${topBanner ? '' : 'rounded-t-lg'} bg-green-50 px-3 py-1.5 text-center text-xs font-semibold text-green-700`}
        >
          You saved {formatINR(couponSavings)}
          <span aria-hidden className="coupon-shine pointer-events-none absolute inset-y-0 left-0 w-1/3" />
        </div>
      )}

      {/* Confetti burst */}
      {celebrateKey > 0 && appliedCode && (
        <div
          key={`burst-${celebrateKey}`}
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-3 z-10 h-0 w-0"
        >
          {CONFETTI.map(([x, y, r, color, delay], i) => (
            <span
              key={i}
              className="coupon-confetti absolute block h-1.5 w-2 rounded-[1px]"
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
      )}

      {/* Manual code box — Apply sits inside the box */}
      <div className="px-3 pt-3">
        <div className="flex items-center rounded-md border border-border bg-background px-3 py-1.5 focus-within:border-primary">
          <div className="min-w-0 flex-1">
            <label htmlFor="checkout-coupon-input" className="block text-[10px] leading-none text-muted-foreground">
              Enter coupon code
            </label>
            <input
              id="checkout-coupon-input"
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                if (error) setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  apply(input, true);
                }
              }}
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              className="mt-1 w-full bg-transparent text-sm font-medium uppercase outline-none placeholder:normal-case"
            />
          </div>
          <button
            type="button"
            onClick={() => apply(input, true)}
            disabled={!input.trim() || busy !== null}
            className="ml-2 shrink-0 text-sm font-semibold text-primary disabled:text-muted-foreground"
          >
            {manualBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Apply'}
          </button>
        </div>
        {error && <p className="mt-1.5 text-xs text-destructive">{error}</p>}
      </div>

      {/* Applied row */}
      {appliedCode && (
        <div key={`applied-${celebrateKey}`} className="coupon-pop flex items-center justify-between gap-3 px-3 pt-3">
          <span className="flex items-center gap-1.5 text-sm font-semibold text-secondary-foreground">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-green-600"><Check className="h-3 w-3 text-white" strokeWidth={3} /></span>
            &quot;{appliedCode}&quot; applied
          </span>
          <button
            type="button"
            onClick={onRemove}
            className="shrink-0 text-xs font-semibold text-muted-foreground hover:text-destructive"
          >
            Remove
          </button>
        </div>
      )}

      {/* Best "Show on checkout" coupon with its own Apply (until one is applied) */}
      {!appliedCode && best && (
        <div className="flex items-center justify-between gap-3 px-3 pt-3">
          <div className="flex min-w-0 items-start gap-2.5">
            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary/15 text-secondary">
              <Tag className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">
                Save {offerLabel(best)} with &quot;{best.code}&quot;
              </p>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {best.min_order_value > 0
                  ? `On orders above ${formatINR(best.min_order_value)}`
                  : 'No minimum order value'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => apply(best.code, false)}
            disabled={busy !== null}
            className="shrink-0 rounded-md border border-secondary px-3.5 py-1.5 text-xs font-semibold text-secondary transition-colors hover:bg-secondary hover:text-secondary-foreground disabled:opacity-60"
          >
            {busy === best.code ? 'Applying…' : 'Apply'}
          </button>
        </div>
      )}

      {/* View all coupons & Offers */}
      {coupons.length > 0 ? (
        <button
          type="button"
          onClick={() => (onViewAll ? onViewAll() : setShowAll((v) => !v))}
          className="mt-1 flex w-full items-center gap-0.5 px-3 py-2.5 text-xs font-medium text-secondary hover:underline"
        >
          View all coupons &amp; Offers{' '}
          {showAll && !onViewAll ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        </button>
      ) : (
        <div className="pb-3" />
      )}

      {showAll && !onViewAll && coupons.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-border/60 bg-muted/30 p-3">
          <div className="flex items-center gap-1.5 text-sm font-semibold">
            <Tag className="h-3.5 w-3.5 text-secondary" />
            Coupons &amp; Offers
          </div>
          {coupons.map((c) => renderRow(c, c.code.toUpperCase() === appliedCode?.toUpperCase()))}
        </div>
      )}
    </div>
  );
}
