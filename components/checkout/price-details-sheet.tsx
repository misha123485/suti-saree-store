'use client';

import { X } from 'lucide-react';
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { formatINR } from '@/lib/format';

interface PriceDetailsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subtotal: number;
  shipping: number;
  payableTotal: number;
  totalSavings: number;
  paymentMethod: 'online' | 'cod' | 'partial';
  /** Rupee amount of the online-payment discount (shown even if COD is selected). */
  onlineDiscountAmount: number;
  discountBreakdown?: { label: string; amount: number }[];
}

// Bottom popup opened from the mobile sticky pay bar ("View price details").
export default function PriceDetailsSheet({
  open,
  onOpenChange,
  subtotal,
  shipping,
  payableTotal,
  totalSavings,
  paymentMethod,
  onlineDiscountAmount,
  discountBreakdown = [],
}: PriceDetailsSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        hideClose
        className="mx-auto flex max-h-[85dvh] max-w-lg flex-col gap-0 rounded-t-3xl p-0"
      >
        <SheetHeader className="flex-row items-center justify-between border-b border-border/60 px-5 py-4 text-left">
          <div>
            <SheetTitle className="font-serif text-lg font-bold text-primary">Price details</SheetTitle>
            <SheetDescription className="sr-only">Breakdown of what you pay for this order</SheetDescription>
          </div>
          <SheetClose
            aria-label="Close price details"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-border/70 text-primary"
          >
            <X className="h-4 w-4" />
          </SheetClose>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 text-sm">
          <div className="flex flex-col gap-2.5">
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
            {onlineDiscountAmount > 0 && (
              <div className="flex justify-between font-medium text-green-700">
                <span>{paymentMethod === 'online' ? 'Online payment discount' : 'Pay online to save an extra'}</span>
                <span>
                  {paymentMethod === 'online' ? '-' : ''}
                  {formatINR(onlineDiscountAmount)}
                </span>
              </div>
            )}
            <div className="flex justify-between text-muted-foreground">
              <span>Shipping</span>
              <span className={shipping > 0 ? '' : 'font-medium text-green-700'}>
                {shipping > 0 ? formatINR(shipping) : 'Free'}
              </span>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between border-t border-border/60 pt-4">
            <span className="font-bold">To pay</span>
            <span className="font-serif text-xl font-bold text-primary">{formatINR(payableTotal)}</span>
          </div>

          {totalSavings > 0 && (
            <p className="mt-3 rounded-lg bg-green-50 px-3 py-2 text-center text-xs font-semibold text-green-700">
              You are saving {formatINR(totalSavings)} on this order
            </p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
