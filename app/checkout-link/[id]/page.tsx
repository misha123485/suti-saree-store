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
//
// Speed: the feed-item lookup starts the moment this page mounts (it no longer
// waits for the cart to hydrate), and /checkout/ is prefetched in parallel, so
// the cart hydration, the API call and the checkout JS all load at once.
export default function CheckoutLinkPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { startBuyNow, cartReady } = useCart() as any;
  const ran = useRef(false);
  const lookup = useRef<Promise<any> | null>(null);

  // 1) Kick off everything that doesn't need the cart, immediately.
  useEffect(() => {
    router.prefetch('/checkout/');
    lookup.current = fetch(`/api/feed-item/${encodeURIComponent(params.id)}/`, { cache: 'no-store' }).then((res) => {
      if (!res.ok) throw new Error('not found');
      return res.json();
    });
    lookup.current.catch(() => {}); // handled below; avoids an unhandled-rejection warning
  }, [params.id, router]);

  // 2) As soon as the cart is ready, use the (usually already finished) lookup.
  useEffect(() => {
    if (ran.current || cartReady === false) return;
    ran.current = true;
    (async () => {
      try {
        const qs = new URLSearchParams(window.location.search);
        const qty = Math.max(1, Math.min(10, parseInt(qs.get('quantity') || '1', 10) || 1));
        const { product, size, feedItemId } = await lookup.current!;
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
  }, [router, startBuyNow, cartReady]);

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-primary text-primary-foreground"
    >
      <style>{`
        @keyframes cl-rise { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
        @keyframes cl-fill { from { transform: scaleX(0); } to { transform: scaleX(0.9); } }
        @keyframes cl-sheen { from { transform: translateX(-100%); } to { transform: translateX(260%); } }
        .cl-word { animation: cl-rise .5s ease-out both; }
        .cl-sub  { animation: cl-rise .5s .12s ease-out both; }
        .cl-bar  { transform-origin: left; animation: cl-fill 2.4s cubic-bezier(.16,.84,.3,1) forwards; }
        .cl-sheen { animation: cl-sheen 1.4s .3s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .cl-word, .cl-sub { animation: none; }
          .cl-bar { animation: none; transform: scaleX(.6); }
          .cl-sheen { animation: none; display: none; }
        }
      `}</style>

      <p className="cl-word font-serif text-4xl italic tracking-wide sm:text-5xl">Suti Saree</p>

      {/* gold thread that fills while we set things up */}
      <div className="mt-8 h-px w-44 overflow-hidden bg-primary-foreground/20 sm:w-56">
        <div className="cl-bar relative h-full w-full overflow-hidden bg-[hsl(43_70%_52%)]">
          <span className="cl-sheen absolute inset-y-0 left-0 w-1/3 bg-white/60 blur-[2px]" />
        </div>
      </div>

      <p className="cl-sub mt-6 text-sm tracking-wide text-primary-foreground/80">Setting up your checkout</p>
    </div>
  );
}
