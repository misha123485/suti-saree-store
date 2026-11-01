'use client';

import { Globe, Truck } from 'lucide-react';
import { useCountry } from '@/components/country-provider';
import { formatEta } from '@/lib/intl-checkout';

// Shown on the product page instead of the India pincode checker when the visitor is shopping
// in an international country.
export default function IntlShipsTo() {
  const { countryCode, countryName, zones } = useCountry();
  const zone = zones.find((z) => z.countries.includes(countryCode)) ?? null;
  const eta = formatEta(zone);
  return (
    <div className="rounded-lg border border-border/60 bg-card p-4">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <Truck className="h-4 w-4 text-secondary" />
        Delivery to {countryName}
      </div>
      <div className="flex items-start gap-2 rounded-md bg-secondary/10 p-3 text-xs text-muted-foreground">
        <Globe className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <p>
          Ships worldwide from India by express courier{eta ? <>, estimated delivery <span className="font-semibold text-foreground">{eta}</span></> : null}.
          Import duties and taxes of your country are not included and are paid on delivery. Card payment only.
        </p>
      </div>
    </div>
  );
}
