'use client';

import { useState } from 'react';
import { Truck, Clock, ChevronDown, RotateCcw } from 'lucide-react';

// Static delivery info card. Values come from lib/store-policy.ts, which
// mirrors Google Merchant Center > Shipping and returns exactly (cut off,
// handling, transit, total delivery, free shipping, free returns), so the
// on-site promise never mismatches what is declared to Google.
import {
  STORE_POLICY,
  HANDLING_LABEL,
  TRANSIT_LABEL,
  TOTAL_DELIVERY_LABEL,
  RETURN_WINDOW_LABEL,
} from '@/lib/store-policy';

import { useCountry } from '@/components/country-provider';
import IntlShipsTo from './intl-ships-to';

export default function DeliveryInfo() {
  const [isOpen, setIsOpen] = useState(false);
  const { countryCode } = useCountry();
  if (countryCode !== 'IN') return <IntlShipsTo />;

  return (
    <div className="rounded-lg border border-border/60 bg-card p-4">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between gap-2 text-sm font-semibold"
      >
        <span className="flex items-center gap-2">
          <Truck className="h-4 w-4 text-secondary" />
          Delivery details
          <span className="font-normal text-muted-foreground">
            ({TOTAL_DELIVERY_LABEL})
          </span>
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {isOpen && (
        <div className="mt-2.5 flex flex-col gap-2 rounded-md bg-secondary/10 p-3 text-xs text-muted-foreground">
          <div className="flex items-start gap-2">
            <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <p>
              Orders placed before {STORE_POLICY.orderCutoffLabel} ({STORE_POLICY.orderCutoffTimezone}) are dispatched in{' '}
              <span className="font-semibold text-foreground">{HANDLING_LABEL}</span>, then take{' '}
              <span className="font-semibold text-foreground">{TRANSIT_LABEL}</span> in transit to any destination in India.
            </p>
          </div>
          <div className="flex items-start gap-2">
            <Truck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <p>
              Estimated total delivery: <span className="font-semibold text-foreground">{TOTAL_DELIVERY_LABEL}</span>.{' '}
              <span className="font-semibold text-foreground">Free shipping</span> on all orders.
            </p>
          </div>
          <div className="flex items-start gap-2">
            <RotateCcw className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <p>
              <span className="font-semibold text-foreground">{RETURN_WINDOW_LABEL}</span> free returns on unworn items with original packaging.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
