'use client';

import { useEffect, useRef, useState } from 'react';
import { ShoppingBag } from 'lucide-react';
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
}: MobileStickyCartBarProps) {
  const hasCoupon = !!couponCode && couponDiscount > 0;
  const finalPrice = hasCoupon ? Math.max(0, price - couponDiscount) : price;

  // Publish this bar's real height (it grows when the coupon line shows and
  // with the phone's safe-area inset) as --sticky-bar-h, so the floating
  // WhatsApp / chat button can sit just above it with only a small gap.
  const barRef = useRef<HTMLDivElement>(null);

  // Hidden when the page loads. The bar slides in only AFTER the shopper has
  // scrolled down past the in-page Add to Bag / Buy Now buttons
  // (#product-inline-cta), i.e. once those buttons are off the TOP of the
  // screen. While the in-page buttons are visible (or still below the fold)
  // the bar stays hidden, so two sets of the same buttons never show at once.
  // Scrolling back up so the in-page buttons reappear hides it again. If that
  // block does not exist, the bar is shown so there is still a way to buy.
  const [show, setShow] = useState(false);
  useEffect(() => {
    const target = document.getElementById('product-inline-cta');
    if (!target || typeof IntersectionObserver === 'undefined') {
      setShow(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => setShow(!entry.isIntersecting && entry.boundingClientRect.bottom <= 0),
      { threshold: 0 }
    );
    io.observe(target);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const el = barRef.current;
    if (!el) return;
    const root = document.documentElement;
    const publish = () => root.style.setProperty('--sticky-bar-h', show ? `${el.offsetHeight}px` : '0px');
    publish();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(publish) : null;
    ro?.observe(el);
    window.addEventListener('resize', publish);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', publish);
      root.style.removeProperty('--sticky-bar-h');
    };
  }, [show]);

  return (
    <div
      ref={barRef}
      className={`fixed inset-x-0 bottom-0 z-30 bg-background transition-transform duration-200 md:hidden ${show ? 'translate-y-0' : 'pointer-events-none translate-y-full'}`}
      aria-hidden={!show}
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      {hasCoupon && (
        <p className="bg-green-50 px-4 py-1 text-center text-xs font-medium text-green-700">
          🎉 Congratulations! You saved {formatINR(couponDiscount)} with code &quot;{couponCode}&quot;
        </p>
      )}
      <div className="flex items-center gap-3 px-4 py-1.5">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span
              className={`font-serif text-2xl font-bold ${hasCoupon ? 'text-green-600' : 'text-primary'}`}
            >
              {formatINR(finalPrice)}
            </span>
            {hasCoupon ? (
              <span className="text-sm text-muted-foreground line-through">{formatINR(price)}</span>
            ) : (
              mrp &&
              mrp > price && (
                <span className="text-sm text-muted-foreground line-through">{formatINR(mrp)}</span>
              )
            )}
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
