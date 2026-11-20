'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, MapPin, Truck } from 'lucide-react';
import { checkPincodeServiceability, isValidPincode, PincodeResult } from '@/lib/pincode-api';
import {
  fetchFulfillmentSettings,
  DEFAULT_FULFILLMENT_SETTINGS,
  FulfillmentSettings,
} from '@/lib/marketing-api';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

// ONE delivery bar used on both the product page and the shopping bag, so the
// design and the date always match. The confirmed pincode is stored in
// localStorage (same key the old PincodeChecker used) and a window event is
// fired on every change, so entering a pincode on the product page shows up
// in the shopping bag instantly (and vice versa) -- even in another tab.
const PIN_KEY = 'aruhi_delivery_pincode';
const PIN_EVENT = 'aruhi:pincode-changed';

// ---- Delivery date estimate: same rules as components/product/pincode-checker.tsx
// (2 PM IST order cut-off, handling days + zone transit days from Admin >
// Marketing > Shipping & Returns Timing). ----
const ORDER_CUTOFF_HOUR = 14;
type DeliveryTier = 'metro' | 'other' | 'remote';
const ZONE_TIER: Record<string, DeliveryTier> = {
  '1': 'metro',
  '2': 'other',
  '3': 'other',
  '4': 'metro',
  '5': 'other',
  '6': 'other',
  '7': 'metro',
  '8': 'remote',
  '9': 'remote',
};
const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmtDate = (d: Date) => `${d.getDate()} ${SHORT_MONTHS[d.getMonth()]}`;
const addDaysTo = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

export function estimateDelivery(pincode: string, f: FulfillmentSettings): string {
  const now = new Date();
  const cutoff = new Date(now);
  cutoff.setHours(ORDER_CUTOFF_HOUR, 0, 0, 0);
  const start = new Date(now);
  if (now >= cutoff) start.setDate(start.getDate() + 1);
  const tier = ZONE_TIER[pincode[0]] ?? 'other';
  const w =
    tier === 'metro'
      ? { min: f.delivery_metro_min, max: f.delivery_metro_max }
      : tier === 'remote'
        ? { min: f.delivery_remote_min, max: f.delivery_remote_max }
        : { min: f.delivery_other_min, max: f.delivery_other_max };
  const minDate = addDaysTo(start, f.dispatch_days_min + w.min);
  const maxDate = addDaysTo(start, f.dispatch_days_max + w.max);
  return fmtDate(minDate) === fmtDate(maxDate)
    ? `By ${fmtDate(maxDate)}`
    : `${fmtDate(minDate)} – ${fmtDate(maxDate)}`;
}

function readSaved(): PincodeResult | null {
  try {
    const raw = window.localStorage.getItem(PIN_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as PincodeResult;
    return saved?.serviceable ? saved : null;
  } catch {
    return null; // storage unavailable -- bar just starts empty
  }
}

export default function DeliveryBar({ className = '' }: { className?: string }) {
  const [panelOpen, setPanelOpen] = useState(false);
  const [input, setInput] = useState('');
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PincodeResult | null>(null);
  const [fulfillment, setFulfillment] = useState<FulfillmentSettings>(DEFAULT_FULFILLMENT_SETTINGS);

  useEffect(() => {
    fetchFulfillmentSettings()
      .then(setFulfillment)
      .catch(() => {});
  }, []);

  // Load the saved pincode and stay in sync with any other DeliveryBar on
  // the page (product page <-> shopping bag) or in another tab.
  useEffect(() => {
    const sync = () => setResult(readSaved());
    sync();
    window.addEventListener(PIN_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(PIN_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const handleCheck = useCallback(async () => {
    const pin = input.trim();
    if (!isValidPincode(pin)) {
      setError('Enter a valid 6-digit PIN code');
      return;
    }
    setError(null);
    setChecking(true);
    try {
      const res = await checkPincodeServiceability(pin);
      if (!res.serviceable) {
        setError(res.message || 'Delivery is not available at this PIN code');
        return;
      }
      try {
        window.localStorage.setItem(PIN_KEY, JSON.stringify({ ...res, savedAt: Date.now() }));
      } catch {
        /* ignore */
      }
      setResult(res);
      setPanelOpen(false);
      setInput('');
      window.dispatchEvent(new Event(PIN_EVENT));
    } catch {
      setError('Could not check this PIN code. Please try again.');
    } finally {
      setChecking(false);
    }
  }, [input]);

  return (
    <div className={className}>
      <div className="flex items-center justify-between gap-3 px-4 py-2.5">
        {result ? (
          <span className="flex min-w-0 items-start gap-2 text-sm text-foreground">
            <Truck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span className="min-w-0">
              <span className="block leading-snug">
                Delivering to <b>{result.pincode}</b>
                {result.city ? `, ${result.city}` : ''}
              </span>
              <span className="block text-xs font-semibold text-emerald-700">
                Delivery: {estimateDelivery(result.pincode, fulfillment)}
                {' · '}
                {result.codAvailable ? 'COD available' : 'Prepaid only'}
              </span>
            </span>
          </span>
        ) : (
          <span className="flex items-center gap-2 text-sm font-medium text-foreground">
            <MapPin className="h-4 w-4 shrink-0 text-primary" />
            Check delivery time &amp; services
          </span>
        )}
        <button
          type="button"
          onClick={() => setPanelOpen((o) => !o)}
          className="shrink-0 text-xs font-bold tracking-wide text-primary"
        >
          {result ? 'CHANGE' : 'ENTER PIN CODE'}
        </button>
      </div>
      {panelOpen && (
        <div className="px-4 pb-3">
          <div className="flex gap-2">
            <Input
              inputMode="numeric"
              maxLength={6}
              placeholder="6-digit PIN code"
              value={input}
              onChange={(e) => {
                setInput(e.target.value.replace(/\D/g, ''));
                setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCheck();
              }}
              className="h-9 bg-card"
            />
            <Button
              type="button"
              className="h-9 shrink-0 bg-primary"
              disabled={checking || input.length !== 6}
              onClick={handleCheck}
            >
              {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Check'}
            </Button>
          </div>
          {error && <p className="mt-1.5 text-xs text-destructive">{error}</p>}
        </div>
      )}
    </div>
  );
}
