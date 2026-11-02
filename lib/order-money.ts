// Customer-facing order amounts in the currency the customer was ACTUALLY charged.
//
// Why: order totals are stored in INR (orders.total_amount) but an international order is charged in
// USD/AED/... (orders.charge_currency + charge_amount_minor, set by the database). formatINR() only
// converts when the visitor's country cookie is set, so a customer opening the confirmation / tracking
// link from an email (no cookie) would see INR. These helpers read the order itself, so the amounts are
// always right, on the server and in the browser, whatever the cookie says.
//
// India orders: returns plain INR formatting, identical to formatINR with no display currency.
import { formatMinor } from './intl-api';

interface OrderLike {
  is_international?: boolean | null;
  charge_currency?: string | null;
  charge_amount_minor?: number | string | null;
  total_amount?: number | string | null;
}

export function isInternationalOrder(order: OrderLike | null | undefined): boolean {
  if (!order || !order.is_international) return false;
  const cur = String(order.charge_currency || '').toUpperCase();
  return cur !== '' && cur !== 'INR' && Number(order.charge_amount_minor) > 0 && Number(order.total_amount) > 0;
}

function inr(amount: number): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);
}

/**
 * Format an INR amount of this order the way the customer paid it.
 * The order total is exact (charge_amount_minor). Other lines (items, shipping, discounts) are scaled by the
 * same ratio, so they add up to the total within a cent or so.
 */
export function orderMoney(order: OrderLike | null | undefined, amountInr: number): string {
  const value = Number(amountInr) || 0;
  if (!order || !isInternationalOrder(order)) return inr(value);
  const currency = String(order.charge_currency).toUpperCase();
  const total = Number(order.total_amount);
  const chargedMinor = Number(order.charge_amount_minor);
  const minor = Math.abs(value - total) < 0.5 ? chargedMinor : Math.round((Math.abs(value) * chargedMinor) / total);
  const text = formatMinor(minor, currency);
  return value < 0 && minor > 0 ? `-${text}` : text;
}

/** "USD" for an international order, 'INR' otherwise. */
export function orderCurrency(order: OrderLike | null | undefined): string {
  return isInternationalOrder(order) ? String(order!.charge_currency).toUpperCase() : 'INR';
}
