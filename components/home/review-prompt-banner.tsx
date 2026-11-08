'use client';

// ---------------------------------------------------------------------
// Homepage top banner: "How was your order?"
// Shown ONLY to a logged-in customer whose most recent DELIVERED order
// still has at least one product they have not rated yet. The customer
// can tap stars right there (and optionally add a written review/photos,
// handled by DeliveredItemReview), or hit the cross to hide it.
// The cross snoozes the banner for 7 days for that order (localStorage),
// so it never nags, and it disappears for good once every item is rated.
// Renders nothing for guests / while loading / on any error.
// ---------------------------------------------------------------------

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { X, Sparkles } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { getSupabaseBrowser } from '@/lib/supabase-browser';
import { toPublicMediaUrl } from '@/lib/media-url';
import DeliveredItemReview from '@/components/account/delivered-item-review';

const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_ITEMS_SHOWN = 3;
const dismissKey = (orderId: string) => `review-banner-dismissed:${orderId}`;

interface PendingItem {
  productId: string;
  name: string;
  image: string | null;
  size: string | null;
}

interface PendingOrder {
  id: string;
  items: PendingItem[];
}

function isSnoozed(orderId: string): boolean {
  try {
    const raw = localStorage.getItem(dismissKey(orderId));
    if (!raw) return false;
    return Date.now() - Number(raw) < SNOOZE_MS;
  } catch {
    return false;
  }
}

export default function ReviewPromptBanner() {
  const { user, loading } = useAuth();
  const [pending, setPending] = useState<PendingOrder | null>(null);

  useEffect(() => {
    if (loading || !user) {
      setPending(null);
      return;
    }
    let cancelled = false;

    (async () => {
      try {
        const supabase = getSupabaseBrowser();

        // Latest delivered (non-reseller) order of this customer.
        const { data: orders } = await supabase
          .from('orders')
          .select('id, items, status, is_reseller_order, created_at')
          .eq('user_id', user.id)
          .eq('status', 'delivered')
          .eq('is_reseller_order', false)
          .order('created_at', { ascending: false })
          .limit(1);

        const order = orders?.[0];
        if (!order || cancelled) return;
        if (isSnoozed(order.id)) return;

        const rawItems: any[] = Array.isArray(order.items) ? order.items : [];
        const seen = new Set<string>();
        const candidates: PendingItem[] = [];
        for (const it of rawItems) {
          if (!it?.product_id || seen.has(it.product_id)) continue;
          seen.add(it.product_id);
          candidates.push({
            productId: it.product_id,
            name: it.product_name || 'Your product',
            image: it.image_url ?? null,
            size: it.size ?? null,
          });
        }
        if (candidates.length === 0) return;

        // Which of these has the customer already rated?
        const { data: mine } = await supabase
          .from('reviews')
          .select('product_id')
          .eq('user_id', user.id)
          .in('product_id', candidates.map((c) => c.productId));
        const reviewed = new Set((mine ?? []).map((r: any) => r.product_id));

        const unreviewed = candidates.filter((c) => !reviewed.has(c.productId));
        if (unreviewed.length === 0 || cancelled) return;

        setPending({ id: order.id, items: unreviewed.slice(0, MAX_ITEMS_SHOWN) });
      } catch {
        // Silent: this banner is a nicety and must never break the homepage.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, loading]);

  if (!pending) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(dismissKey(pending.id), String(Date.now()));
    } catch {
      /* ignore */
    }
    setPending(null);
  };

  return (
    <section
      aria-label="Rate your recent order"
      className="relative w-full border-b border-secondary/30 bg-gradient-to-r from-secondary/15 via-secondary/5 to-transparent"
    >
      <div className="mx-auto max-w-3xl px-4 py-3 pr-12 sm:py-4">
        <button
          type="button"
          onClick={dismiss}
          aria-label="Close"
          className="absolute right-2 top-2 rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex items-center gap-2 text-primary">
          <Sparkles className="h-4 w-4 text-secondary" />
          <p className="font-serif text-sm font-semibold sm:text-base">
            Your order was delivered - how did you like it?
          </p>
        </div>

        <div className="mt-2 space-y-2">
          {pending.items.map((item) => (
            <div key={item.productId} className="flex items-start gap-3">
              <div className="relative h-14 w-12 shrink-0 overflow-hidden rounded-md border border-border/60 bg-muted">
                <Image
                  src={toPublicMediaUrl(item.image) || 'https://placehold.co/80x100?text=No+Image'}
                  alt={item.name}
                  fill
                  sizes="48px"
                  className="object-cover"
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{item.name}</p>
                <DeliveredItemReview productId={item.productId} productName={item.name} />
              </div>
            </div>
          ))}
        </div>

        <Link
          href={`/account/orders/${pending.id}`}
          className="mt-2 inline-block text-xs font-medium text-primary hover:underline"
        >
          View order
        </Link>
      </div>
    </section>
  );
}
