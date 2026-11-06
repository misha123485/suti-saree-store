'use client';

import { useEffect, useRef, useState } from 'react';
import { BadgeCheck, ChevronDown, ChevronRight, Loader2, Tag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatINR } from '@/lib/format';
import type { Coupon } from '@/lib/coupons-api';

/**
 * Coupon card shown at the TOP of checkout.
 *
 *  - Before a coupon is applied: coupon-code input + Apply, best offer, and
 *    "View all coupons".
 *  - After: green "You saved ₹X" strip, "CODE applied" row with Remove, and
 *    "View all coupons".
 *
 * Replaces the old top-of-screen toast. Celebration is pure CSS
 * (transform/opacity only, ~1.1s, no JS animation loop, no library) so it
 * never slows the page down. Respects prefers-reduced-motion.
 */

type Props = {
  appliedCode: string | null;
  couponSavings: number;
  availableCoupons: Coupon[];
  couponInput: string;
  onCouponInputChange: (v: string) => void;
  onApplyInput: () => void;
  applyingInput: boolean;
  onApplyFromList: (c: Coupon) => void;
  applyingFromList: string | null;
  onRemove: () => void;
  error: string | null;
};

// Pre-computed confetti: [x px, y px, rotation deg, color, delay ms]
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

export function CouponTopCard({
  appliedCode,
  couponSavings,
  availableCoupons,
  couponInput,
  onCouponInputChange,
  onApplyInput,
  applyingInput,
  onApplyFromList,
  applyingFromList,
  onRemove,
  error,
}: Props) {
  const [showAll, setShowAll] = useState(false);
  const [celebrateKey, setCelebrateKey] = useState(0);
  const prevCode = useRef<string | null>(appliedCode);

  // Fire the celebration only when a coupon goes from "none" -> "applied".
  useEffect(() => {
    if (appliedCode && !prevCode.current) {
      setCelebrateKey((k) => k + 1);
      setShowAll(false);
    }
    prevCode.current = appliedCode;
  }, [appliedCode]);

  const best = availableCoupons[0];
  const hasMore = availableCoupons.length > 1;

  const couponRow = (c: Coupon) => (
    <div
      key={c.id}
      className="flex items-center justify-between gap-3 rounded-lg border border-dashed border-secondary/60 bg-secondary/10 px-3 py-2.5"
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm font-bold tracking-wide text-primary">{c.code}</span>
          <span className="text-xs font-semibold text-secondary-foreground">
            {c.discount_type === 'percentage' ? `${c.discount_value}% OFF` : `${formatINR(c.discount_value)} OFF`}
          </span>
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {c.min_order_value > 0 ? `On orders above ${formatINR(c.min_order_value)}` : 'No minimum order value'}
        </p>
      </div>
      <button
        type="button"
        onClick={() => onApplyFromList(c)}
        disabled={applyingFromList === c.code}
        className="flex shrink-0 items-center gap-1 rounded-md border border-primary bg-background px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary hover:text-primary-foreground disabled:opacity-60"
      >
        {applyingFromList === c.code ? 'Applying…' : 'Apply'}
      </button>
    </div>
  );

  return (
    <div className="relative mb-4 rounded-lg border border-border/60 bg-card">
      {/* Savings strip — only once a coupon is on */}
      {appliedCode && couponSavings > 0 && (
        <div
          key={`strip-${celebrateKey}`}
          className="coupon-strip relative overflow-hidden rounded-t-lg bg-green-50 px-3 py-1.5 text-center text-xs font-semibold text-green-700"
        >
          You saved {formatINR(couponSavings)}
          {/* shine sweep */}
          <span aria-hidden className="coupon-shine pointer-events-none absolute inset-y-0 left-0 w-1/3" />
        </div>
      )}

      {/* Celebration burst (confetti + pop badge) */}
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

      {appliedCode ? (
        <>
          <div
            key={`applied-${celebrateKey}`}
            className="coupon-pop flex items-center justify-between gap-3 px-3 py-3"
          >
            <span className="flex items-center gap-1.5 text-sm font-semibold text-secondary-foreground">
              <BadgeCheck className="h-4 w-4 text-green-600" />
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
          {hasMore && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="flex w-full items-center gap-0.5 border-t border-border/60 px-3 py-2 text-xs font-medium text-secondary hover:underline"
            >
              View all coupons{' '}
              {showAll ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            </button>
          )}
        </>
      ) : (
        <>
          {/* Always-visible input, top of checkout */}
          <div className="flex gap-2 px-3 pt-3">
            <Input
              placeholder="Enter coupon code"
              value={couponInput}
              onChange={(e) => onCouponInputChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && couponInput.trim() && !applyingInput) {
                  e.preventDefault();
                  onApplyInput();
                }
              }}
              className="h-9"
              autoCapitalize="characters"
            />
            <Button
              type="button"
              variant="outline"
              className="h-9 shrink-0"
              disabled={applyingInput || !couponInput.trim()}
              onClick={onApplyInput}
            >
              {applyingInput ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Apply'}
            </Button>
          </div>
          {error && <p className="px-3 pt-1.5 text-xs text-destructive">{error}</p>}

          {best && (
            <div className="flex items-center justify-between gap-3 px-3 py-3">
              <div className="flex min-w-0 items-start gap-2.5">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary/15 text-secondary">
                  <Tag className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">
                    Save{' '}
                    {best.discount_type === 'percentage'
                      ? `${best.discount_value}%`
                      : formatINR(best.discount_value)}{' '}
                    with &quot;{best.code}&quot;
                  </p>
                  {hasMore ? (
                    <button
                      type="button"
                      onClick={() => setShowAll((v) => !v)}
                      className="mt-0.5 flex items-center gap-0.5 text-xs font-medium text-secondary hover:underline"
                    >
                      View all coupons{' '}
                      {showAll ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                    </button>
                  ) : (
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {best.min_order_value > 0
                        ? `On orders above ${formatINR(best.min_order_value)}`
                        : 'No minimum order value'}
                    </p>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => onApplyFromList(best)}
                disabled={applyingFromList === best.code}
                className="shrink-0 rounded-md border border-secondary px-3.5 py-1.5 text-xs font-semibold text-secondary transition-colors hover:bg-secondary hover:text-secondary-foreground disabled:opacity-60"
              >
                {applyingFromList === best.code ? 'Applying…' : 'Apply'}
              </button>
            </div>
          )}
          {!best && <div className="pb-3" />}
        </>
      )}

      {/* Full coupon list */}
      {showAll && availableCoupons.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-border/60 bg-muted/30 p-3">
          <div className="flex items-center gap-1.5 text-sm font-semibold">
            <Tag className="h-3.5 w-3.5 text-secondary" />
            Available Coupons
          </div>
          {availableCoupons.map(couponRow)}
        </div>
      )}
    </div>
  );
}
