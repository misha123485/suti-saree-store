// Marks an international order 'paid' after Stripe confirmed the payment. Same race-safe pattern as
// lib/cashfree-mark-paid.ts: the atomic `update ... where status='pending'` means a replayed webhook
// (or webhook + browser return) is a harmless no-op.
import { getSupabaseAdmin } from './supabase-admin';
import { sendEmail } from './email';
import { orderStatusUpdateEmail } from './email-templates';

export const STRIPE_ORDER_COLUMNS =
  'id, status, total_amount, payment_method, customer_name, customer_email, tracking_number, courier_name, items, is_international, charge_currency, charge_amount_minor, stripe_session_id';

export interface StripePayableOrder {
  id: string;
  status: string;
  total_amount: number | string;
  payment_method?: string | null;
  customer_name?: string | null;
  customer_email?: string | null;
  tracking_number?: string | null;
  courier_name?: string | null;
  items?: any;
  is_international?: boolean | null;
  charge_currency?: string | null;
  charge_amount_minor?: number | string | null;
}

export async function markOrderPaidViaStripe(
  order: StripePayableOrder,
  paymentIntentId: string,
  sessionId: string | null,
): Promise<{ ok: true; alreadyPaid: boolean } | { ok: false; error: string; status: number }> {
  if (order.status === 'paid') return { ok: true, alreadyPaid: true };
  if (order.status !== 'pending') return { ok: false, error: `Order is ${order.status}`, status: 409 };

  const admin = getSupabaseAdmin();
  const { data: updated, error } = await admin
    .from('orders')
    .update({
      status: 'paid',
      payment_gateway: 'stripe',
      // Historical column name: holds "the gateway payment id" for every gateway so all existing
      // "paid online?" logic keeps working.
      razorpay_payment_id: paymentIntentId,
      stripe_payment_intent_id: paymentIntentId,
      ...(sessionId ? { stripe_session_id: sessionId } : {}),
    })
    .eq('id', order.id)
    .eq('status', 'pending')
    .select('id');

  if (error) return { ok: false, error: 'Failed to update order status', status: 500 };
  if (!updated || updated.length === 0) return { ok: true, alreadyPaid: true };

  if (order.customer_email) {
    const { subject, html } = orderStatusUpdateEmail({
      id: order.id,
      customer_name: order.customer_name,
      status: 'paid',
      tracking_number: order.tracking_number,
      courier_name: order.courier_name,
      items: order.items,
      total_amount: order.total_amount,
      payment_method: order.payment_method,
      // Phase 13: amounts in the currency the customer paid (USD/AED/...), not INR.
      money: order,
    } as any);
    sendEmail({ to: order.customer_email, subject, html }).catch((err) =>
      console.error('[stripe] payment-confirmed email failed:', err),
    );
  }
  return { ok: true, alreadyPaid: false };
}
