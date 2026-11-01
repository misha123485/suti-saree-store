'use client';

import { Globe } from 'lucide-react';
import { useCountry } from '@/components/country-provider';

// Country / currency picker. Renders nothing unless international selling is switched on and
// card payments are configured (so India-only stores never see it).
export default function CountrySwitcher({ className = '', compact = false }: { className?: string; compact?: boolean }) {
  const { switcherAvailable, countryCode, countries, setCountry } = useCountry();
  if (!switcherAvailable) return null;
  return (
    <label className={`inline-flex items-center gap-1 text-xs ${className}`}>
      <Globe className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="sr-only">Country and currency</span>
      <select
        value={countryCode}
        onChange={(e) => setCountry(e.target.value)}
        aria-label="Country and currency"
        className="max-w-[9.5rem] cursor-pointer rounded border border-current/20 bg-transparent py-1 pl-1 pr-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-secondary"
      >
        <option value="IN" className="text-foreground">{compact ? 'INR' : 'India (₹ INR)'}</option>
        {countries.map((c) => (
          <option key={c.code} value={c.code} className="text-foreground">
            {compact ? c.currency : `${c.name} (${c.currency})`}
          </option>
        ))}
      </select>
    </label>
  );
}
