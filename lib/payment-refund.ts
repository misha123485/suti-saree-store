// One refund entry point for every gateway. Orders store WHICH gateway took the money in
// orders.payment_gateway (null/'razorpay' = Razorpay, the original behaviour).
//   Razorpay: refunds by payment id            (orders.razorpay_payment_id)
//   Cashfree: refunds by Cashfree ORDER id     (orders.cashfree_order_id)
//   Stripe:   refunds by payment intent        (orders.stripe_payment_intent_id), in the charge currency
import { refundRazorpayPayment } from './razorpay-refund';
import { refundCashfreePayment } from './cashfree';
import { refundStripePayment, normalizeStripeMinor } from './stripe';
import { getSupabaseAdmin } from './supabase-admin';

export interface RefundableOrder {
  id: string;
  payment_gateway?: string | null;
  razorpay_payment_id?: string | null; // holds the Cashfree payment id for Cashfree orders
  cashfree_order_id?: string | null;
}

export async function refundOrderPayment(
  order: RefundableOrder,
  amountInRupees: number
): Promise<{ success: true; refundId: string } | { success: false; error: string }> {
  if (order.payment_gateway === 'stripe') {
    // International order: the customer paid in a foreign currency, admin refunds are in INR.
    // Convert pro-rata: refund_minor = charge_minor * (refund_inr / total_inr). Full refund => no amount.
    const { data: o } = await getSupabaseAdmin()
      .from('orders')
      .select('stripe_payment_intent_id, razorpay_payment_id, charge_amount_minor, charge_currency, total_amount')
      .eq('id', order.id)
      .maybeSingle();
    const pi = o?.stripe_payment_intent_id || o?.razorpay_payment_id;
    if (!pi) return { success: false, error: 'Stripe payment id missing on this order' };
    const total = Number(o?.total_amount) || 0;
    const full = total > 0 && amountInRupees >= total - 0.5;
    const minor = full
      ? null
      : normalizeStripeMinor(
          Math.round((Number(o?.charge_amount_minor) * amountInRupees) / total),
          String(o?.charge_currency || 'USD'),
        );
    if (!full && (!minor || minor < 1)) return { success: false, error: 'Invalid refund amount' };
    return refundStripePayment(pi, minor, `rf_${order.id}_${full ? 'full' : minor}`);
  }
  if (order.payment_gateway === 'cashfree') {
    if (!order.cashfree_order_id) return { success: false, error: 'Cashfree order id missing on this order' };
    // Deterministic id (<= 40 chars) => retrying the same refund can never double-refund.
    const refundId = `rf_${order.id.replace(/-/g, '')}`.slice(0, 40);
    return refundCashfreePayment(order.cashfree_order_id, amountInRupees, refundId);
  }
  if (!order.razorpay_payment_id) return { success: false, error: 'No payment id on this order' };
  return refundRazorpayPayment(order.razorpay_payment_id, amountInRupees);
}
