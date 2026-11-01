import { getDisplayCurrency } from './intl-pricing';
import { formatInrAs } from './intl-pricing';

export function formatINR(amount: number): string {
  // International visitor (see components/country-provider.tsx): same price, shown in their currency.
  const d = getDisplayCurrency();
  if (d) return formatInrAs(amount, d.currency, d.settings);
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

export function discountPct(price: number, mrp?: number | null): number {
  if (!mrp || mrp <= price) return 0;
  return Math.round(((mrp - price) / mrp) * 100);
}
