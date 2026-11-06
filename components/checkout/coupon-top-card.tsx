'use client';

import { memo, useEffect, useRef, useState } from 'react';
import { BadgeCheck, BadgePercent, ChevronRight, Tag } from 'lucide-react';
import { formatINR } from '@/lib/format';
import './coupon-top-card.css';

const COLORS = ['#f59e0b', '#be123c', '#16a34a', '#ec4899', '#2563eb', '#eab308', '#9333ea'];

// Deterministic "random" so there is no hydration mismatch and no Math.random per render.
const PIECES = Array.from({ length: 30 }, (_, i) => {
  const n = (i * 9301 + 49297) % 233280;
  const r = n / 233280;
  return {
    left: `${(i / 30) * 100 + (r * 3 - 1.5)}%`,
    delay: `${(r * 0.5).toFixed(2)}s`,
    dur: `${(1.8 + r * 1.0).toFixed(2)}s`,
    x: `${Math.round((r - 0.5) * 160)}px`,
    rot: `${Math.round(360 + r * 540)}deg`,
    color: COLORS[i % COLORS.length],
    round: i % 3 === 0,
  };
});

function Celebration({ text }: { text: string }) {
  return (
    <div className="cc-overlay" aria-hidden="true">
      {PIECES.map((p, i) => (
        <span
          key={i}
          className={`cc-piece${p.round ? ' round' : ''}`}
          style={
            {
              left: p.left,
              background: p.color,
              '--delay': p.delay,
              '--d': p.dur,
              '--x': p.x,
              '--r': p.rot,
            } as React.CSSProperties
          }
        />
      ))}
      <div className="cc-pill">
        <span>🎉</span>
        <span>{text}</span>
      </div>
    </div>
  );
}

interface Offer {
  code: string;
  headline: string; // e.g. "₹100"
  note: string; // e.g. "On orders above ₹999"
}

interface Props {
  appliedCode: string | null;
  savedAmount: number;
  strip: string | null; // green strip text shown before a coupon is applied
  offer: Offer | null;
  hasMore: boolean;
  applyingOffer: boolean;
  onApplyOffer: () => void;
  onRemove: () => void;
  onViewAll: () => void;
  codeInput: string;
  onCodeInput: (v: string) => void;
  onApplyCode: () => void;
  applyingCode: boolean;
  error: string | null;
}

function CouponTopCardImpl({
  appliedCode,
  savedAmount,
  strip,
  offer,
  hasMore,
  applyingOffer,
  onApplyOffer,
  onRemove,
  onViewAll,
  codeInput,
  onCodeInput,
  onApplyCode,
  applyingCode,
  error,
}: Props) {
  // Celebrate only when a coupon becomes applied during this visit — not when the
  // page loads with a coupon that was already saved.
  const prev = useRef<string | null>(appliedCode);
  const [celebrate, setCelebrate] = useState(false);

  useEffect(() => {
    if (appliedCode && !prev.current) {
      setCelebrate(true);
      const t = setTimeout(() => setCelebrate(false), 2700);
      prev.current = appliedCode;
      return () => clearTimeout(t);
    }
    prev.current = appliedCode;
  }, [appliedCode]);

  const savedText = formatINR(savedAmount);

  if (appliedCode) {
    return (
      <>
        {celebrate && <Celebration text={`Yay! You saved ${savedText}`} />}
        <div className="mb-4 overflow-hidden rounded-lg border border-green-200 bg-card">
          <div className="cc-shine flex items-center gap-1.5 bg-green-50 px-3 py-2 text-sm font-semibold text-green-700">
            <BadgePercent className="h-4 w-4" />
            <span>
              You saved <span className="cc-saved-pop inline-block">{savedText}</span>
            </span>
          </div>
          <div className="flex items-center gap-2 border-t border-green-100 px-3 py-2.5">
            <input
              value={codeInput}
              onChange={(e) => onCodeInput(e.target.value.toUpperCase())}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && codeInput.trim()) onApplyCode();
              }}
              placeholder="Enter coupon code"
              className="h-9 min-w-0 flex-1 rounded-md border border-border/70 bg-background px-3 text-sm outline-none focus:border-primary"
            />
            {codeInput.trim() && (
              <button
                type="button"
                onClick={onApplyCode}
                disabled={applyingCode}
                className="shrink-0 rounded-md border border-secondary px-3 py-1.5 text-xs font-semibold text-secondary disabled:opacity-60"
              >
                {applyingCode ? 'Applying…' : 'Apply'}
              </button>
            )}
          </div>
          {error && <p className="px-3 pb-1 text-xs text-destructive">{error}</p>}
          <div className="flex items-center justify-between gap-3 border-t border-border/50 px-3 py-2.5">
            <span className="flex min-w-0 items-center gap-1.5 text-sm font-medium text-foreground">
              <BadgeCheck className="h-4 w-4 shrink-0 text-green-600" />
              <span className="truncate">&quot;{appliedCode}&quot; applied</span>
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
              onClick={onViewAll}
              className="flex w-full items-center gap-0.5 border-t border-border/50 px-3 py-2 text-xs font-medium text-secondary hover:underline"
            >
              View all coupons <ChevronRight className="h-3 w-3" />
            </button>
          )}
        </div>
      </>
    );
  }

  return (
    <div className="mb-4 overflow-hidden rounded-lg border border-border/60">
      {strip && (
        <div className="flex items-center justify-center gap-1.5 bg-primary px-3 py-1.5 text-center text-xs font-semibold text-primary-foreground">
          <BadgePercent className="h-3.5 w-3.5" />
          {strip}
        </div>
      )}
      {offer && (
        <div className="flex items-center justify-between gap-3 bg-card px-3 py-3">
          <div className="flex min-w-0 items-start gap-2.5">
            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary/15 text-secondary">
              <Tag className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">
                Save {offer.headline} with &quot;{offer.code}&quot;
              </p>
              {hasMore ? (
                <button
                  type="button"
                  onClick={onViewAll}
                  className="mt-0.5 flex items-center gap-0.5 text-xs font-medium text-secondary hover:underline"
                >
                  View all coupons <ChevronRight className="h-3 w-3" />
                </button>
              ) : (
                <p className="mt-0.5 truncate text-xs text-muted-foreground">{offer.note}</p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onApplyOffer}
            disabled={applyingOffer}
            className="shrink-0 rounded-md border border-secondary px-3.5 py-1.5 text-xs font-semibold text-secondary transition-colors hover:bg-secondary hover:text-secondary-foreground disabled:opacity-60"
          >
            {applyingOffer ? 'Applying…' : 'Apply'}
          </button>
        </div>
      )}
    </div>
  );
}

export const CouponTopCard = memo(CouponTopCardImpl);
