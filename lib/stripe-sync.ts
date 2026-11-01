// Asks Stripe directly whether an order's Checkout Session was paid, and marks the order paid if so.
// Called when the customer returns from Stripe (so the confirmation page is correct even if the
// webhook is a few seconds late) -- the webhook remains the safety net if they never return.
import { getSupabaseAdmin } from './supabase-admin';
import { isStripeConfigured, stripeFetch } from './stripe';
import { markOrderPaidViaStripe, STRIPE_ORDER_COLUMNS } from './stripe-mark-paid';
import { runOrderConfirmationSideEffects } from './order-confirmation';

export async function syncStripeOrderIfPending(orderId: string): Promise<void> {
  if (!isStripeConfigured()) return;
  const admin = getSupabaseAdmin();
  const { data: order } = await admin.from('orders').select(STRIPE_ORDER_COLUMNS).eq('id', orderId).maybeSingle();
  if (!order || order.status !== 'pending' || !order.is_international || !order.stripe_session_id) return;

  const res = await stripeFetch<any>('GET', `/checkout/sessions/${encodeURIComponent(order.stripe_session_id)}`);
  if (!res.ok) return;
  const s = res.data;
  if (s.payment_status !== 'paid') return;
  // Same amount/currency guard as the webhook.
  if (
    Number(s.amount_total) !== Number(order.charge_amount_minor) ||
    String(s.currency).toUpperCase() !== String(order.charge_currency).toUpperCase()
  ) {
    console.error(`[stripe-sync] amount/currency mismatch for ${order.id}`);
    return;
  }
  const pi = typeof s.payment_intent === 'string' ? s.payment_intent : s.payment_intent?.id;
  if (!pi) return;
  const r = await markOrderPaidViaStripe(order as any, pi, s.id);
  if (r.ok && !r.alreadyPaid) {
    runOrderConfirmationSideEffects(order.id).catch((e) => console.error('[stripe-sync] side effects failed:', e));
  }
}
