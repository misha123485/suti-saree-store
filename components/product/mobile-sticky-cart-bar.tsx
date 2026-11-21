'use client';

import { useEffect, useRef, useState } from 'react';
import { ShoppingBag, Truck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatINR } from '@/lib/format';

interface MobileStickyCartBarProps {
  name: string;
  price: number;
  mrp?: number | null;
  inStock: boolean;
  onAdd: () => void;
  onBuyNow: () => void;
  couponCode?: string | null;
  couponDiscount?: number;
  /** Slim "Get at ₹X" offer strip (MegaDealOffers compact) shown above the bar row. */
  offerSlot?: React.ReactNode;
}

// Fixed bottom bar shown only on small screens on the product detail page,
// so shoppers can add to cart without scrolling back up to the buy box.
export default function MobileStickyCartBar({
  name,
  price,
  mrp,
  inStock,
  onAdd,
  onBuyNow,
  couponCode,
  couponDiscount = 0,
  offerSlot,
}: MobileStickyCartBarProps) {
  const hasCoupon = !!couponCode && couponDiscount > 0;
  const finalPrice = hasCoupon ? Math.max(0, price - couponDiscount) : price;

  // Publish this bar's real height (it grows when the coupon line shows and
  // with the phone's safe-area inset) as --sticky-bar-h, so the floating
  // WhatsApp / chat button can sit just above it with only a small gap.
  const barRef = useRef<HTMLDivElement>(null);

  // Hidden when the page loads. The bar slides in only once the shopper has
  // scrolled to the Ratings & Reviews section (#product-reviews) -- i.e. when
  // the top of the reviews block enters the screen -- and stays visible while
  // they keep scrolling through/below the reviews. Scrolling back up above the
  // reviews hides it again. If the reviews block does not exist at all, the
  // bar is shown so there is still a way to buy.
  const [show, setShow] = useState(false);
  useEffect(() => {
    let raf = 0;
    const check = () => {
      raf = 0;
      const target = document.getElementById('product-reviews');
      if (!target) {
        setShow(true);
        return;
      }
      const rect = target.getBoundingClientRect();
      // display:none (e.g. hidden desktop copy) => zero size => keep hidden.
      if (rect.width === 0 && rect.height === 0) {
        setShow(false);
        return;
      }
      // Reviews started: its top edge has come up into the visible screen.
      setShow(rect.top <= window.innerHeight - 80);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(check);
    };
    check();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  useEffect(() => {
    const el = barRef.current;
    if (!el) return;
    const root = document.documentElement;
    const publish = () => root.style.setProperty('--sticky-bar-h', show ? `${el.offsetHeight}px` : '0px');
    root.style.setProperty('--gcr-base-bottom', '24px');
    publish();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(publish) : null;
    ro?.observe(el);
    window.addEventListener('resize', publish);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', publish);
      root.style.removeProperty('--sticky-bar-h');
      root.style.removeProperty('--gcr-base-bottom');
    };
  }, [show]);

  return (
    <div
      ref={barRef}
      className={`fixed inset-x-0 bottom-0 z-30 bg-background transition-transform duration-200 md:hidden ${show ? 'translate-y-0' : 'pointer-events-none translate-y-full'}`}
      aria-hidden={!show}
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      {offerSlot}
      {hasCoupon && (
        <p className="bg-green-50 px-4 py-1 text-center text-xs font-medium text-green-700">
          🎉 Congratulations! You saved {formatINR(couponDiscount)} with code &quot;{couponCode}&quot;
        </p>
      )}
      <div className="flex items-center gap-3 px-4 py-1.5">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-1.5">
            <span
              className={`font-serif text-lg font-bold leading-tight ${hasCoupon ? 'text-green-600' : 'text-primary'}`}
            >
              {formatINR(finalPrice)}
            </span>
            {mrp && mrp > finalPrice && (
              <span className="text-[11px] leading-tight text-muted-foreground line-through">{formatINR(mrp)}</span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-1.5 leading-tight">
            {mrp && mrp > finalPrice && (
              <span className="rounded bg-emerald-100 px-1 py-px text-[9px] font-bold text-emerald-700">
                {Math.round(((mrp - finalPrice) / mrp) * 100)}% OFF
              </span>
            )}
            <span className="flex items-center gap-0.5 text-[9px] font-semibold uppercase tracking-wide text-emerald-600">
              <Truck className="h-2.5 w-2.5" />
              Free Delivery
            </span>
          </div>
        </div>
        {inStock ? (
          <div className="flex shrink-0 items-center gap-2">
            <Button
              onClick={onAdd}
              variant="outline"
              size="lg"
              className="gap-1.5 border-primary px-4 text-primary"
            >
              <ShoppingBag className="h-4 w-4" />
              Add to Bag
            </Button>
            <Button
              onClick={onBuyNow}
              size="lg"
              className="btn-shine bg-primary px-5 text-primary-foreground"
            >
              Buy Now
            </Button>
          </div>
        ) : (
          <Button disabled className="shrink-0 opacity-50">
            Out of Stock
          </Button>
        )}
      </div>
    </div>
  );
}
