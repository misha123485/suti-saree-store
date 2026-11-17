'use client';

import { useState } from 'react';
import { Loader2, MapPin } from 'lucide-react';
import { toast } from 'sonner';

export interface LocationAddress {
  line1: string;
  line2: string;
  pincode: string;
  city: string;
  state: string;
}

/**
 * "Use my current location" -- 100% free, no API key.
 * Browser GPS gives latitude/longitude, then OpenStreetMap's free reverse
 * geocoder (Nominatim, one call per tap) turns it into road / area /
 * PIN / city / state. House number is rarely in OSM, so the customer
 * still adds that by hand (or by voice).
 */
export default function UseLocationButton({ onResult }: { onResult: (a: LocationAddress) => void }) {
  const [busy, setBusy] = useState(false);

  const run = () => {
    if (!navigator.geolocation) {
      toast.error('Location is not available on this device. Please type your address.');
      return;
    }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const url = new URL('https://nominatim.openstreetmap.org/reverse');
          url.searchParams.set('format', 'jsonv2');
          url.searchParams.set('addressdetails', '1');
          url.searchParams.set('zoom', '18');
          url.searchParams.set('accept-language', 'en');
          url.searchParams.set('lat', String(pos.coords.latitude));
          url.searchParams.set('lon', String(pos.coords.longitude));
          const res = await fetch(url.toString());
          if (!res.ok) throw new Error('lookup failed');
          const data = await res.json();
          const a = data?.address || {};
          const road = [a.house_number, a.road].filter(Boolean).join(', ');
          const area = a.neighbourhood || a.suburb || a.quarter || a.hamlet || a.city_district || '';
          const line1 = road || area;
          const line2 = road && area ? area : '';
          const pin = String(a.postcode || '').replace(/\D/g, '');
          const out: LocationAddress = {
            line1,
            line2,
            pincode: pin.length === 6 ? pin : '',
            city: a.city || a.town || a.village || a.state_district || a.county || '',
            state: a.state || '',
          };
          if (!out.line1 && !out.pincode && !out.city) {
            toast.error('Could not find your address here. Please type it.');
          } else {
            onResult(out);
            toast.success('Address filled from your location — please add house/flat no. and check it.');
          }
        } catch {
          toast.error('Could not get the address. Please type it.');
        } finally {
          setBusy(false);
        }
      },
      (err) => {
        setBusy(false);
        toast.error(
          err.code === 1
            ? 'Location permission is blocked. Allow location in your browser settings, or type your address.'
            : 'Could not get your location. Please type your address.'
        );
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
    );
  };

  return (
    <div className="grid gap-1">
      <button
        type="button"
        onClick={run}
        disabled={busy}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-primary/40 bg-primary/5 px-3 py-2.5 text-sm font-semibold text-primary hover:bg-primary/10 disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
        {busy ? 'Finding your address…' : 'Use my current location'}
      </button>
      <p className="text-[11px] text-muted-foreground">
        Fills street, area and PIN code from your phone’s location. Add your house/flat number after.
      </p>
    </div>
  );
}
