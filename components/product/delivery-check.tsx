'use client';

import { useState, useEffect, useCallback, FormEvent } from 'react';
import { Loader2, MapPin } from 'lucide-react';
import { checkPincodeServiceability } from '@/lib/pincode-api';
import { FulfillmentSettings } from '@/lib/marketing-api';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useCountry } from '@/components/country-provider';
import IntlShipsTo from './intl-ships-to';
import {
  SavedLocation,
  loadSavedLocation,
  saveLocation,
  effectiveHandlingStart,
  tierForPincode,
  tierWindow,
  addDays,
} from './pincode-checker';

// Compact inline delivery check shown right above Add to Bag / Buy Now.
// The delivery date is dispatch days + transit days for the pincode's zone,
// both read from Admin > Marketing > Shipping & Returns Timing (passed in as
// `fulfillment`), so it always matches the rest of the site. The saved
// pincode is shared with PincodeChecker (same localStorage key).
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatLong(d: Date): string {
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export default function DeliveryCheck({ fulfillment }: { fulfillment: FulfillmentSettings }) {
  const { countryCode } = useCountry();
  const [saved, setSaved] = useState<SavedLocation | null>(null);
  const [pincode, setPincode] = useState('');
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const existing = loadSavedLocation();
    if (existing) {
      setSaved(existing);
      setPincode(existing.pincode);
    }
  }, []);

  const onCheck = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (pincode.length !== 6) return;
      setChecking(true);
      setError(null);
      try {
        const res = await checkPincodeServiceability(pincode);
        if (res.serviceable) {
          saveLocation(res);
          setSaved({ ...res, savedAt: Date.now() });
        } else {
          setSaved(null);
          setError(res.message);
        }
      } catch {
        setError('Could not check this pincode. Please try again.');
      } finally {
        setChecking(false);
      }
    },
    [pincode]
  );

  if (countryCode !== 'IN') return <IntlShipsTo />;

  const deliveryDate = saved
    ? (() => {
        const start = effectiveHandlingStart(new Date());
        const win = tierWindow(fulfillment, tierForPincode(saved.pincode));
        return addDays(start, fulfillment.dispatch_days_max + win.max);
      })()
    : null;

  return (
    <div className="flex flex-col gap-1.5">
      <form onSubmit={onCheck} className="flex gap-2">
        <div className="relative flex-1">
          <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={pincode}
            onChange={(e) => {
              setPincode(e.target.value.replace(/\D/g, '').slice(0, 6));
              setError(null);
            }}
            placeholder="Pincode daalo (e.g. 700001)"
            inputMode="numeric"
            aria-label="Delivery pincode"
            className="pl-9"
          />
        </div>
        <Button type="submit" disabled={checking || pincode.length !== 6} className="px-5">
          {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Check'}
        </Button>
      </form>
      {error && <p className="text-xs font-medium text-destructive">{error}</p>}
      {!error && saved && deliveryDate && (
        <p className="text-xs text-muted-foreground">
          Delivery by <span className="font-semibold text-foreground">{formatLong(deliveryDate)}</span>
          {' · '}
          {saved.codAvailable ? 'COD available' : 'Prepaid orders only'}
        </p>
      )}
    </div>
  );
}
