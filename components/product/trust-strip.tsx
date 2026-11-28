'use client';

import { Lock, PackageOpen, Truck } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { FulfillmentSettings, returnWindowText } from '@/lib/marketing-api';

/**
 * Premium 3-part trust row shown right after "Additional Details" on the
 * product page (between two SectionSplitter bands). The return days come
 * from Admin > Marketing > Shipping & Returns Timing.
 */
export default function TrustStrip({ fulfillment }: { fulfillment: FulfillmentSettings }) {
  const items: { key: string; icon: LucideIcon; label: string }[] = [
    { key: 'cod', icon: Truck, label: 'Free cash on delivery' },
    { key: 'return', icon: PackageOpen, label: `${returnWindowText(fulfillment)} easy return` },
    { key: 'secure', icon: Lock, label: 'Secure payment' },
  ];
  return (
    <ul className="-my-1.5 flex items-stretch py-1" aria-label="Why shop with us">
      {items.map((it, i) => {
        const Icon = it.icon;
        return (
          <li
            key={it.key}
            className={`min-w-0 flex-1 px-1 text-center ${i > 0 ? 'border-l border-secondary/40' : ''}`}
          >
            <span className="mx-auto mb-1 flex h-8 w-8 items-center justify-center rounded-full border border-secondary bg-card">
              <Icon className="h-4 w-4 text-primary" strokeWidth={1.6} aria-hidden="true" />
            </span>
            <p className="text-[11px] font-medium leading-tight text-primary">{it.label}</p>
          </li>
        );
      })}
    </ul>
  );
}
