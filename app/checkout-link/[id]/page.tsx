'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useCart } from '@/lib/cart-context';
import { markCheckoutEntry } from '@/lib/checkout-return';

// Landing page for the Google Shopping "Checkout" button.
// Merchant Center -> Checkout settings -> URL:
//   https://www.sutisaree.com/checkout/?add-to-cart={id}&quantity=1
// next.config.js redirects that to /checkout-link/{id}/?quantity=1. This page
// looks the feed id up (/api/feed-item/[id]), starts a Buy Now with that exact
// colour/size and sends the shopper to /checkout. The shopper's own saved cart
// is not touched. Anything we can't resolve (out of stock, deleted product,
// unknown id) goes to /shop/ instead of an empty checkout.
export default function CheckoutLinkPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { startBuyNow, cartReady } = useCart() as any;
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current || cartReady === false) return;
    ran.current = true;
    (async () => {
      try {
        const qs = new URLSearchParams(window.location.search);
        const qty = Math.max(1, Math.min(10, parseInt(qs.get('quantity') || '1', 10) || 1));
        const res = await fetch(`/api/feed-item/${encodeURIComponent(params.id)}/`, { cache: 'no-store' });
        if (!res.ok) throw new Error('not found');
        const { product, size, feedItemId } = await res.json();
        if (!product || product.inStock === false || (product.stock_quantity ?? 1) <= 0) {
          toast.error('Sorry, this item is out of stock');
          router.replace('/shop/');
          return;
        }
        const stock = product.stock_quantity ?? Infinity;
        startBuyNow(product, size, Math.min(qty, stock), feedItemId);
        markCheckoutEntry({ fromBuyNow: true });
        router.replace('/checkout/');
      } catch {
        router.replace('/shop/');
      }
    })();
  }, [params.id, router, startBuyNow, cartReady]);

  return (
    <div className="flex min-h-[50vh] items-center justify-center text-sm text-muted-foreground">
      Taking you to checkout…
    </div>
  );
}
