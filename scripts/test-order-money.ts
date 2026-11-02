// Run: npx tsx scripts/test-order-money.ts
import { orderMoney, orderCurrency, isInternationalOrder } from '../lib/order-money';

let fail = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want;
  if (!ok) fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: ${got}${ok ? '' : ` (wanted ${want})`}`);
};

const us = { is_international: true, charge_currency: 'USD', charge_amount_minor: 5499, total_amount: 5000 };
const india = { is_international: false, charge_currency: 'INR', charge_amount_minor: null, total_amount: 5000 };

eq('US total is exact charged amount', orderMoney(us, 5000), '$54.99');
eq('US line item scaled (half)', orderMoney(us, 2500), '$27.50');
eq('US discount keeps sign', orderMoney(us, -500), '-$5.50');
eq('US zero', orderMoney(us, 0), '$0.00');
eq('India stays INR', orderMoney(india, 5000), '₹5,000');
eq('null order falls back to INR', orderMoney(null, 1200), '₹1,200');
eq('currency US', orderCurrency(us), 'USD');
eq('currency India', orderCurrency(india), 'INR');
eq('intl flag but no charge amount -> INR', isInternationalOrder({ ...us, charge_amount_minor: 0 }), false);
console.log(fail ? `${fail} FAILED` : 'ALL PASS');
process.exit(fail ? 1 : 0);
