'use client';

import Image from 'next/image';
import { X, CreditCard, Wallet, Split, Zap, ShieldCheck, Truck } from 'lucide-react';
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { formatINR } from '@/lib/format';
import { toPublicMediaUrl } from '@/lib/media-url';
import type { CartItem } from '@/lib/types';

interface PriceDetailsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: CartItem[];
  subtotal: number;
  shipping: number;
  payableTotal: number;
  totalSavings: number;
  paymentMethod: 'online' | 'cod' | 'partial';
  /** Rupee amount of the online-payment discount (shown even if COD is selected). */
  onlineDiscountAmount: number;
  discountBreakdown?: { label: string; amount: number }[];
  /** Only for partial pay. */
  partialAdvance?: number;
  partialBalance?: number;
  /** Lets a COD customer switch to online right from the popup. */
  onSwitchToOnline?: () => void;
}

const METHOD_INFO = {
  online: {
    icon: CreditCard,
    title: 'Pay Online',
    sub: 'UPI · Cards · Netbanking',
    note: 'Confirmed instantly and dispatched first',
  },
  cod: {
    icon: Wallet,
    title: 'Cash on Delivery',
    sub: 'Pay when your order arrives',
    note: 'Dispatched after online orders',
  },
  partial: {
    icon: Split,
    title: 'Partial Pay',
    sub: 'Part now, rest on delivery',
    note: 'Dispatched along with prepaid orders',
  },
} as const;

// Bottom popup opened from the mobile sticky pay bar ("View price details").
export default function PriceDetailsSheet({
  open,
  onOpenChange,
  items,
  subtotal,
  shipping,
  payableTotal,
  totalSavings,
  paymentMethod,
  onlineDiscountAmount,
  discountBreakdown = [],
  partialAdvance,
  partialBalance,
  onSwitchToOnline,
}: PriceDetailsSheetProps) {
  const info = METHOD_INFO[paymentMethod];
  const MethodIcon = info.icon;
  const itemCount = items.reduce((n, i) => n + (i.quantity ?? 1), 0);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        hideClose
        className="mx-auto flex max-h-[88dvh] max-w-lg flex-col gap-0 rounded-t-3xl p-0"
      >
        <div className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-border" aria-hidden="true" />
        <SheetHeader className="flex-row items-center justify-between px-5 pb-3 pt-3 text-left">
          <div>
            <SheetTitle className="font-serif text-xl font-bold text-primary">Price details</SheetTitle>
            <SheetDescription className="text-xs">
              {itemCount} item{itemCount > 1 ? 's' : ''} in your order
            </SheetDescription>
          </div>
          <SheetClose
            aria-label="Close price details"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-border/70 text-primary"
          >
            <X className="h-4 w-4" />
          </SheetClose>
        </SheetHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 pb-5 text-sm">
          {/* Selected payment method */}
          <div
            className={`flex items-start gap-3 rounded-2xl border p-3.5 ${
              paymentMethod === 'cod' ? 'border-amber-200 bg-amber-50/70' : 'border-primary/30 bg-primary/[0.04]'
            }`}
          >
            <span
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                paymentMethod === 'cod' ? 'bg-amber-100 text-amber-700' : 'bg-primary text-primary-foreground'
              }`}
            >
              <MethodIcon className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Payment method
              </p>
              <p className="font-serif text-base font-bold leading-tight text-foreground">{info.title}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{info.sub}</p>
              {paymentMethod === 'partial' && partialAdvance !== undefined && partialBalance !== undefined && (
                <p className="mt-1.5 text-xs font-medium text-foreground">
                  Pay <b>{formatINR(partialAdvance)}</b> now · <b>{formatINR(partialBalance)}</b> on delivery
                </p>
              )}
              <p className="mt-1.5 flex items-center gap-1 text-[11px] font-medium text-secondary">
                {paymentMethod === 'cod' ? <Truck className="h-3 w-3" /> : <Zap className="h-3 w-3" />}
                {info.note}
              </p>
            </div>
          </div>

          {paymentMethod === 'cod' && onlineDiscountAmount > 0 && onSwitchToOnline && (
            <button
              type="button"
              onClick={() => {
                onSwitchToOnline();
                onOpenChange(false);
              }}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-secondary/60 bg-secondary/10 px-3 py-2.5 text-xs font-semibold text-primary"
            >
              <Zap className="h-3.5 w-3.5 text-secondary" />
              Pay online instead &amp; save {formatINR(onlineDiscountAmount)}
            </button>
          )}

          {/* Items */}
          <ul className="space-y-2.5">
            {items.map((item) => {
              const thumb = toPublicMediaUrl(item.product.images?.[0]) || 'https://placehold.co/56x64?text=No+Image';
              return (
                <li key={`${item.product.id}-${item.size}`} className="flex items-center gap-3">
                  <span className="relative h-12 w-10 shrink-0 overflow-hidden rounded-md bg-muted ring-1 ring-border/60">
                    <Image src={thumb} alt={item.product.name} fill sizes="40px" className="object-cover" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-1 text-[13px] font-medium text-foreground">{item.product.name}</span>
                    <span className="block text-[11px] text-muted-foreground">Qty {item.quantity ?? 1}</span>
                  </span>
                  <span className="text-[13px] font-semibold">
                    {formatINR(item.product.price * (item.quantity ?? 1))}
                  </span>
                </li>
              );
            })}
          </ul>

          {/* Breakdown */}
          <div className="space-y-2.5 rounded-2xl border border-border/60 bg-card p-4">
            <div className="flex justify-between text-muted-foreground">
              <span>Subtotal</span>
              <span>{formatINR(subtotal)}</span>
            </div>
            {discountBreakdown.map((d) => (
              <div key={d.label} className="flex justify-between font-medium text-green-700">
                <span>{d.label}</span>
                <span>-{formatINR(d.amount)}</span>
              </div>
            ))}
            {onlineDiscountAmount > 0 && paymentMethod !== 'cod' && (
              <div className="flex justify-between font-medium text-green-700">
                <span>Online payment discount</span>
                <span>-{formatINR(onlineDiscountAmount)}</span>
              </div>
            )}
            <div className="flex justify-between text-muted-foreground">
              <span>Shipping</span>
              <span className={shipping > 0 ? '' : 'font-medium text-green-700'}>
                {shipping > 0 ? formatINR(shipping) : 'Free'}
              </span>
            </div>
            <div className="flex items-center justify-between border-t border-dashed border-border pt-3">
              <span className="font-bold">To pay</span>
              <span className="font-serif text-2xl font-bold text-primary">{formatINR(payableTotal)}</span>
            </div>
          </div>

          {totalSavings > 0 && (
            <p className="rounded-xl bg-green-50 px-3 py-2 text-center text-xs font-semibold text-green-700">
              🎉 You are saving {formatINR(totalSavings)} on this order
            </p>
          )}

          <p className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5 text-secondary" /> 100% secure checkout · Easy returns
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
