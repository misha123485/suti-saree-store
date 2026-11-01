// Run: npx tsx scripts/test-intl-pricing.ts
import { DEFAULT_INTERNATIONAL_SETTINGS } from '../lib/intl-api';
import { convertInrToMinor, formatInrAs, setDisplayCurrency } from '../lib/intl-pricing';
import { formatINR } from '../lib/format';

const s = { ...DEFAULT_INTERNATIONAL_SETTINGS };
let fail = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want;
  if (!ok) fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: ${got}${ok ? '' : ` (wanted ${want})`}`);
};

// INR 5000 @ USD 90, markup 2%  -> effective rate 88.235 -> 56.67 -> ceil 57 -> $56.99
eq('INR 5000 -> USD minor', convertInrToMinor(5000, 'USD', s), 5699);
eq('INR 5000 -> USD text', formatInrAs(5000, 'USD', s), '$56.99');
eq('INR 5000 -> OMR (3-dec, x.05)', convertInrToMinor(5000, 'OMR', s) % 50, 0);
eq('price markup 10% applied', convertInrToMinor(5000, 'USD', { ...s, intl_price_markup_percent: 10 }), 6299);
eq('x.00 rounding', convertInrToMinor(5000, 'USD', { ...s, price_rounding: 'x.00' }), 5700);
eq('discount line keeps sign', formatInrAs(-500, 'USD', s), '-$5.99');
// formatINR is unchanged for India / server (no window) ...
eq('formatINR plain (server)', formatINR(1999).replace(/\s/g, ''), '₹1,999');
// ... and switches only when a browser display currency is set.
(globalThis as any).window = { location: { pathname: '/product/x' } };
setDisplayCurrency({ countryCode: 'US', countryName: 'United States', currency: 'USD', settings: s });
eq('formatINR in USD mode', formatINR(5000), '$56.99');
(globalThis as any).window.location.pathname = '/admin/orders';
eq('admin stays INR', formatINR(1999).replace(/\s/g, ''), '₹1,999');
process.exit(fail ? 1 : 0);
