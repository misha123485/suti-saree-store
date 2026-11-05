'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, ChevronRight, Gift, Tag, Wallet, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { formatINR } from '@/lib/format';
import {
  Coupon,
  computeCouponDiscount,
  fetchProductPageCoupons,
  validateCoupon,
} from '@/lib/coupons-api';
import { fetchMyStoreCredit } from '@/lib/store-credit-api';
import type { LoyaltySettings } from '@/lib/loyalty-api';
import type { OfferDisplaySettings } from '@/lib/offer-display-settings';

interface Props {
  settings: OfferDisplaySettings;
  price: number;
  appliedCoupon: Coupon | null;
  couponDiscount: number;
  onCouponApply: (coupon: Coupon, discount: number) => void;
  onCouponRemove: () => void;
  paymentDiscount: { enabled: boolean; percent: number; label: string };
  isLoggedIn: boolean;
  loyaltyBalance: number;
  loyaltySettings: LoyaltySettings;
}

interface OfferRow {
  key: string;
  title: React.ReactNode;
  amount: number;
  note: string;
  details: string;
  icon: React.ReactNode;
  counted: boolean;
  action?: React.ReactNode;
}

export default function MegaDealOffers({
  settings,
  price,
  appliedCoupon,
  couponDiscount,
  onCouponApply,
  onCouponRemove,
  paymentDiscount,
  isLoggedIn,
  loyaltyBalance,
  loyaltySettings,
}: Props) {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [storeCredit, setStoreCredit] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const [applying, setApplying] = useState<string | null>(null);

  useEffect(() => {
    if (!settings.show_coupons) return;
    fetchProductPageCoupons().then(setCoupons).catch(() => {});
  }, [settings.show_coupons]);

  useEffect(() => {
    if (!isLoggedIn || !settings.show_store_credit) {
      setStoreCredit(0);
      return;
    }
    fetchMyStoreCredit().then((c) => setStoreCredit(c.balance)).catch(() => {});
  }, [isLoggedIn, settings.show_store_credit]);

  // Coupons the admin chose to show that this price actually qualifies for.
  const eligible = useMemo(() => {
    if (!settings.show_coupons) return [];
    return coupons
      .filter((c) => settings.coupon_mode === 'all' || settings.selected_coupon_codes.includes(c.code))
      .filter((c) => c.min_order_value <= price)
      .map((c) => ({ coupon: c, discount: computeCouponDiscount(c, price, 1) }))
      .filter((x) => x.discount > 0)
      .sort((a, b) => b.discount - a.discount);
  }, [coupons, settings, price]);

  // One coupon per order: the one the shopper applied, else the best one.
  const chosen = useMemo(() => {
    if (!settings.show_coupons) return null;
    if (appliedCoupon && couponDiscount > 0) return { coupon: appliedCoupon, discount: couponDiscount };
    return eligible[0] ?? null;
  }, [settings.show_coupons, appliedCoupon, couponDiscount, eligible]);

  const applyCoupon = async (c: Coupon) => {
    if (appliedCoupon?.code === c.code) {
      onCouponRemove();
      return;
    }
    setApplying(c.code);
    try {
      const r = await validateCoupon(c.code, price);
      if (!r.ok || !r.coupon) {
        toast.error(r.error || 'Could not apply this coupon');
        return;
      }
      onCouponApply(r.coupon, r.discount || 0);
      toast.success(`Coupon "${c.code}" applied`);
    } finally {
      setApplying(null);
    }
  };

  // Same order as checkout: coupon -> loyalty -> online % -> store credit.
  const calc = useMemo(() => {
    let remaining = price;
    const couponOff = chosen ? Math.min(chosen.discount, remaining) : 0;
    remaining -= couponOff;

    const canRedeem =
      isLoggedIn &&
      settings.show_loyalty &&
      loyaltySettings.enabled &&
      loyaltyBalance >= loyaltySettings.min_redeem_points &&
      loyaltyBalance > 0;
    const loyaltyWorth = canRedeem
      ? Math.min(Math.round(loyaltyBalance * loyaltySettings.redeem_value_per_point), remaining)
      : 0;
    remaining -= loyaltyWorth;

    const onlineOn = settings.show_online_payment && paymentDiscount.enabled && paymentDiscount.percent > 0;
    const onlineOff = onlineOn ? Math.round((remaining * paymentDiscount.percent) / 100) : 0;
    remaining -= onlineOff;

    const creditOff = isLoggedIn && settings.show_store_credit ? Math.min(Math.round(storeCredit), remaining) : 0;
    remaining -= creditOff;

    return { couponOff, loyaltyWorth, onlineOff, creditOff, total: Math.max(0, remaining) };
  }, [price, chosen, isLoggedIn, settings, loyaltySettings, loyaltyBalance, paymentDiscount, storeCredit]);

  const saved = price - calc.total;
  if (saved <= 0) return null;

  const withParts = [
    calc.couponOff > 0 && 'Coupon',
    calc.loyaltyWorth > 0 && 'Loyalty',
    calc.onlineOff > 0 && 'Online Payment',
    calc.creditOff > 0 && 'Store Credit',
  ].filter(Boolean) as string[];

  const rows: OfferRow[] = [];

  const couponList = [...eligible];
  if (chosen && !couponList.some((x) => x.coupon.code === chosen.coupon.code)) {
    couponList.unshift({ coupon: chosen.coupon, discount: chosen.discount });
  }

  for (const { coupon, discount } of couponList) {
    const isChosen = chosen?.coupon.code === coupon.code;
    const isApplied = appliedCoupon?.code === coupon.code;
    rows.push({
      key: `c-${coupon.code}`,
      title: (
        <span>
          Coupon <span className="font-bold">{coupon.code}</span>
        </span>
      ),
      amount: discount,
      note: coupon.min_order_value > 0 ? `On orders above ${formatINR(coupon.min_order_value)}` : 'No minimum order value',
      details: isChosen
        ? 'Counted in your Mega Deal price. One coupon can be used per order.'
        : 'Only one coupon can be used per order — apply this one instead if you prefer it.',
      icon: <Tag className="h-4 w-4" />,
      counted: isChosen,
      action: (
        <button
          type="button"
          onClick={() => applyCoupon(coupon)}
          disabled={applying === coupon.code}
          className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold disabled:opacity-60 ${
            isApplied ? 'bg-emerald-600 text-white' : 'border border-primary text-primary'
          }`}
        >
          {isApplied ? (
            <span className="flex items-center gap-1">
              <Check className="h-3 w-3" /> Applied
            </span>
          ) : applying === coupon.code ? (
            '…'
          ) : (
            'Apply'
          )}
        </button>
      ),
    });
  }

  if (calc.loyaltyWorth > 0)
    rows.push({
      key: 'loyalty',
      title: 'Your Loyalty Points',
      amount: calc.loyaltyWorth,
      note: `${loyaltyBalance} points ready to use`,
      details: 'Apply your points at checkout for this instant discount.',
      icon: <Gift className="h-4 w-4" />,
      counted: true,
    });

  if (calc.onlineOff > 0)
    rows.push({
      key: 'online',
      title: `${paymentDiscount.percent}% off on ${paymentDiscount.label}`,
      amount: calc.onlineOff,
      note: 'Pay via UPI / card / netbanking',
      details: `Choose "${paymentDiscount.label}" at checkout. Cash on Delivery orders are charged the regular price. No code needed.`,
      icon: <Zap className="h-4 w-4 fill-current" />,
      counted: true,
    });

  if (calc.creditOff > 0)
    rows.push({
      key: 'credit',
      title: 'Your Store Credit',
      amount: calc.creditOff,
      note: `${formatINR(storeCredit)} balance`,
      details: 'Your store credit is used at checkout.',
      icon: <Wallet className="h-4 w-4" />,
      counted: true,
    });

  return (
    <Sheet>
      <SheetTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center justify-between gap-3 rounded-xl border border-violet-200 bg-violet-50/60 px-3.5 py-3 text-left dark:border-violet-900 dark:bg-violet-950/30"
        >
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded bg-gradient-to-r from-rose-600 to-amber-500 px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-white">
                {settings.badge_text}
              </span>
              <span className="font-serif text-lg font-bold text-primary">Get at {formatINR(calc.total)}</span>
              <span className="rounded bg-emerald-600 px-2 py-0.5 text-[11px] font-bold text-white">
                Extra {formatINR(saved)} Off
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">With {withParts.join(' + ')}</p>
          </div>
          <span className="flex shrink-0 items-center text-xs font-semibold text-rose-600">
            Details <ChevronRight className="h-4 w-4" />
          </span>
        </button>
      </SheetTrigger>

      <SheetContent side="bottom" className="mx-auto max-h-[85vh] max-w-md overflow-y-auto rounded-t-2xl p-4">
        <SheetTitle className="sr-only">{settings.badge_text} offers</SheetTitle>
        <SheetDescription className="sr-only">Coupons and offers combined into your best price</SheetDescription>
        <div className="flex flex-col items-center pb-3 text-center">
          <span className="rounded bg-gradient-to-r from-rose-600 to-amber-500 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-white">
            {settings.badge_text}
          </span>
          <div className="mt-2 flex items-center gap-2">
            <span className="font-serif text-xl font-bold text-primary">Get at {formatINR(calc.total)}</span>
            <span className="rounded bg-emerald-600 px-2 py-0.5 text-xs font-bold text-white">
              Extra {formatINR(saved)} Off
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Combine coupons &amp; offers to get maximum discount</p>
        </div>

        <div className="flex flex-col gap-3">
          {rows.map((r) => (
            <div key={r.key} className={`rounded-xl border p-3 ${r.counted ? 'border-border bg-card' : 'border-dashed border-border bg-muted/30'}`}>
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  {r.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{r.title}</p>
                  <p className="truncate text-xs text-muted-foreground">{r.note}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="text-sm font-bold text-emerald-600">{formatINR(r.amount)} off</span>
                  {r.action}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(open === r.key ? null : r.key)}
                className="mt-2 flex items-center gap-0.5 text-xs font-semibold text-rose-600"
              >
                Details <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open === r.key ? 'rotate-180' : ''}`} />
              </button>
              {open === r.key && <p className="mt-1 text-xs text-muted-foreground">{r.details}</p>}
            </div>
          ))}
        </div>

        <p className="mt-4 border-t pt-3 text-center text-[11px] text-muted-foreground">
          Final price may change based on the items in your bag.
        </p>
      </SheetContent>
    </Sheet>
  );
}
