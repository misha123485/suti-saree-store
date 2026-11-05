'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { formatINR, discountPct } from '@/lib/format';

/**
 * "Size: Onesize ... DONE" popup shown when a shopper taps "Add to Bag" on a
 * catalog card (shop, category, similar products...). Bottom sheet on mobile,
 * small centred dialog on desktop. Shows the product photo, price and every
 * size; DONE hands the chosen size back to the caller, which adds it to the bag.
 *
 * NOTE: render this as a SIBLING of any <Link> card -- React portals bubble
 * clicks through the React tree, so inside a <Link> a tap would navigate.
 */
export default function SizePickerSheet({
  name,
  image,
  price,
  mrp,
  sizes,
  onDone,
  onClose,
}: {
  name: string;
  image?: string | null;
  price: number;
  mrp?: number | null;
  sizes: string[];
  onDone: (size: string) => void;
  onClose: () => void;
}) {
  const [shown, setShown] = useState(false);
  const [size, setSize] = useState(sizes[0] ?? '');
  const discount = discountPct(price, mrp);

  const close = () => {
    setShown(false);
    window.setTimeout(onClose, 200);
  };

  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true));
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(id);
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const done = () => {
    if (!size) return;
    setShown(false);
    window.setTimeout(() => {
      onDone(size);
      onClose();
    }, 150);
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Select size"
      onClick={(e) => e.stopPropagation()}
    >
      <div
        className={`absolute inset-0 bg-black/55 transition-opacity duration-200 ${shown ? 'opacity-100' : 'opacity-0'}`}
        onClick={close}
      />
      <div
        className={`relative w-full overflow-hidden rounded-t-3xl bg-background shadow-2xl transition-all duration-200 ease-out sm:max-w-md sm:rounded-3xl ${
          shown ? 'translate-y-0 opacity-100 sm:scale-100' : 'translate-y-full opacity-0 sm:translate-y-4 sm:scale-95'
        }`}
      >
        <div className="flex items-start gap-3 px-4 pb-3 pt-4">
          {image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image} alt={name} className="h-20 w-16 shrink-0 rounded-lg border border-border/60 object-cover" />
          )}
          <div className="min-w-0 flex-1">
            <p className="line-clamp-1 text-sm font-semibold text-foreground">{name}</p>
            <div className="mt-1 flex flex-wrap items-baseline gap-x-1.5">
              <span className="text-base font-bold text-foreground">{formatINR(price)}</span>
              {discount > 0 && mrp && (
                <>
                  <span className="text-xs text-muted-foreground line-through">{formatINR(mrp)}</span>
                  <span className="text-xs font-semibold text-emerald-600">({discount}% OFF)</span>
                </>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="rounded-full p-1.5 text-foreground/70 hover:bg-muted"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="border-t border-border/60 px-4 py-4">
          <p className="mb-3 text-sm font-semibold text-foreground">Size: {size}</p>
          <div className="flex flex-wrap gap-2">
            {sizes.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSize(s)}
                aria-pressed={size === s}
                className={`min-w-[64px] rounded-xl border px-4 py-2.5 text-sm font-semibold transition-colors ${
                  size === s
                    ? 'border-foreground bg-foreground text-background'
                    : 'border-border bg-card text-foreground hover:border-foreground/50'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={done}
          className="w-full bg-primary py-3.5 text-sm font-bold uppercase tracking-wide text-primary-foreground transition-opacity hover:opacity-95 active:opacity-90"
        >
          Done
        </button>
      </div>
    </div>,
    document.body
  );
}
