'use client';

import { useRef, useState } from 'react';
import { Check, ChevronRight, Lock, RefreshCw, ShieldCheck, Truck, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import {
  FulfillmentSettings,
  returnWindowBadgeText,
  returnWindowText,
} from '@/lib/marketing-api';

interface Props {
  /** Return days come from Admin > Marketing > Shipping & Returns Timing. */
  fulfillment: FulfillmentSettings;
}

interface Badge {
  key: string;
  icon: LucideIcon;
  title: string;
  sub: string;
  points: string[];
}

const DISMISS_PX = 100;

/**
 * The four trust cards shown under Buy Now (compact, mobile friendly).
 * Tapping a card opens a bottom sheet with the details; the tabs at the top
 * of the sheet switch between the four cards without closing it.
 */
export default function TrustBadges({ fulfillment }: Props) {
  const badges: Badge[] = [
    {
      key: 'return',
      icon: RefreshCw,
      title: `${returnWindowBadgeText(fulfillment)} easy return`,
      sub: 'Pickup from home',
      points: [
        `Not happy with it? Request a return within ${returnWindowText(fulfillment)} of delivery.`,
        'We pick the saree up from your home, so there is no need to visit a courier office.',
        'Your refund is processed after the pickup is checked.',
      ],
    },
    {
      key: 'cod',
      icon: Truck,
      title: 'Cash on Delivery',
      sub: 'Pay when it arrives',
      points: [
        'Pay in cash to the delivery partner when your order arrives.',
        'Pay online instead and get an extra discount at checkout.',
        'Free delivery on this saree.',
      ],
    },
    {
      key: 'handloom',
      icon: ShieldCheck,
      title: 'Authentic handloom',
      sub: 'Direct from weavers',
      points: [
        'Woven on handlooms by weaver families and sent to you directly.',
        'Soft, light and breathable fabric that is comfortable for daily wear.',
        'Small colour or weave variations are natural in handloom.',
      ],
    },
    {
      key: 'secure',
      icon: Lock,
      title: 'Secure payment',
      sub: 'UPI · Cards · NetBanking',
      points: [
        'Pay with UPI, debit or credit cards, or netbanking.',
        'Your payment goes through a secure payment gateway.',
        'We never store your card details.',
      ],
    },
  ];

  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);
  const sheetRef = useRef<HTMLDivElement>(null);
  const startY = useRef<number | null>(null);
  const dragY = useRef(0);

  const current = badges[idx];
  const CurrentIcon = current.icon;

  const openAt = (i: number) => {
    setIdx(i);
    setOpen(true);
  };

  // Swipe down on the handle / tab area to dismiss. The sheet follows the
  // finger, then either slides away or snaps back.
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return;
    startY.current = e.clientY;
    dragY.current = 0;
    e.currentTarget.setPointerCapture(e.pointerId);
    if (sheetRef.current) sheetRef.current.style.transition = 'none';
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (startY.current === null || !sheetRef.current) return;
    dragY.current = Math.max(0, e.clientY - startY.current);
    sheetRef.current.style.transform = `translateY(${dragY.current}px)`;
  };
  const endDrag = () => {
    if (startY.current === null || !sheetRef.current) return;
    startY.current = null;
    const el = sheetRef.current;
    el.style.transition = 'transform 0.2s ease-out';
    if (dragY.current > DISMISS_PX) {
      el.style.transform = 'translateY(100%)';
      window.setTimeout(() => setOpen(false), 200);
    } else {
      el.style.transform = '';
    }
  };

  return (
    <>
      <section aria-label="Why shop with us" className="grid grid-cols-2 gap-2 max-[370px]:gap-1.5">
        {badges.map((b, i) => (
          <button
            key={b.key}
            type="button"
            aria-haspopup="dialog"
            onClick={() => openAt(i)}
            className="flex min-h-[42px] items-center gap-[7px] rounded-lg border border-border/60 bg-card py-1.5 pl-2.5 pr-2 text-left transition active:scale-[0.985] active:bg-background max-[370px]:gap-1.5 max-[370px]:pl-2 max-[370px]:pr-1.5"
          >
            <b.icon className="h-[15px] w-[15px] shrink-0 text-secondary" />
            <span className="min-w-0 flex-1">
              <span className="block text-[11.5px] font-semibold leading-tight text-foreground max-[370px]:text-[11px]">
                {b.title}
              </span>
              <span className="mt-px block text-[10.5px] leading-[1.2] text-muted-foreground max-[370px]:text-[10px]">
                {b.sub}
              </span>
            </span>
            <ChevronRight className="h-3 w-3 shrink-0 text-foreground/55" />
          </button>
        ))}
      </section>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          ref={sheetRef}
          side="bottom"
          hideClose
          className="mx-auto flex max-h-[85vh] max-w-md flex-col gap-0 rounded-t-[28px] p-0"
        >
          <SheetDescription className="sr-only">Details about {current.title}</SheetDescription>

          <div
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            className="relative cursor-grab touch-none"
          >
            <div className="pb-1 pt-2.5">
              <i className="mx-auto block h-[5px] w-10 rounded-full bg-border" />
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="absolute right-3.5 top-3.5 flex h-8 w-8 items-center justify-center rounded-full bg-card ring-1 ring-border"
            >
              <X className="h-4 w-4" />
            </button>
            <div
              role="tablist"
              className="flex gap-2 overflow-x-auto px-4 pb-3.5 pt-2.5 pr-14 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {badges.map((b, i) => (
                <button
                  key={b.key}
                  type="button"
                  role="tab"
                  aria-selected={i === idx}
                  onClick={() => setIdx(i)}
                  className={`shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                    i === idx
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-card text-muted-foreground'
                  }`}
                >
                  {b.title}
                </button>
              ))}
            </div>
          </div>

          <div
            key={current.key}
            className="overflow-y-auto px-5 pb-6 pt-1 animate-in fade-in-0 slide-in-from-bottom-1 duration-300"
          >
            <div className="flex items-center gap-3.5">
              <span className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full bg-accent text-secondary ring-1 ring-secondary/40">
                <CurrentIcon className="h-6 w-6" strokeWidth={1.6} />
              </span>
              <div className="min-w-0">
                <SheetTitle className="font-serif text-xl font-bold leading-tight text-primary">
                  {current.title}
                </SheetTitle>
                <p className="mt-0.5 text-[13px] text-muted-foreground">{current.sub}</p>
              </div>
            </div>

            <ul className="mt-[18px] flex flex-col gap-2.5">
              {current.points.map((p) => (
                <li
                  key={p}
                  className="flex items-start gap-2.5 rounded-xl border border-border bg-card px-3.5 py-3 text-[13px] leading-snug"
                >
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-secondary" strokeWidth={2.4} />
                  <span>{p}</span>
                </li>
              ))}
            </ul>

            <button
              type="button"
              onClick={() => setOpen(false)}
              className="mt-[18px] h-12 w-full rounded-xl bg-primary text-[15px] font-semibold text-primary-foreground"
            >
              Got it
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
