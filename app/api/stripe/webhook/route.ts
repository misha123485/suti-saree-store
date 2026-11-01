import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { verifyStripeWebhook } from '@/lib/stripe';
import { markOrderPaidViaStripe, STRIPE_ORDER_COLUMNS } from '@/lib/stripe-mark-paid';
import { runOrderConfirmationSideEffects } from '@/lib/order-confirmation';

// Stripe Dashboard > Developers > Webhooks > Add endpoint
//   URL: https://<your-domain>/api/stripe/webhook
//   Events: checkout.session.completed, checkout.session.async_payment_succeeded,
//           checkout.session.expired, payment_intent.succeeded, payment_intent.payment_failed,
//           charge.refunded, charge.dispute.created
// Signing secret (whsec_...) -> STRIPE_WEBHOOK_SECRET.
export const dynamic = 'force-dynamic';

async function payIfMatches(orderId: string, paymentIntentId: string, sessionId: string | null, amount: number, currency: string) {
  const admin = getSupabaseAdmin();
  const { data: order, error } = await admin.from('orders').select(STRIPE_ORDER_COLUMNS).eq('id', orderId).maybeSingle();
  if (error) return { status: 500, body: { error: 'Order lookup failed' } };
  if (!order) return { status: 200, body: { received: true, skipped: 'order_not_found' } };
  if (order.status !== 'pending') return { status: 200, body: { received: true, alreadyStatus: order.status } };
  if (!order.is_international) return { status: 200, body: { received: true, skipped: 'not_international' } };

  if (
    Number(amount) !== Number(order.charge_amount_minor) ||
    String(currency).toUpperCase() !== String(order.charge_currency).toUpperCase()
  ) {
    console.error(`[stripe-webhook] amount/currency mismatch for ${order.id}: expected ${order.charge_amount_minor} ${order.charge_currency}, got ${amount} ${currency}`);
    return { status: 200, body: { received: true, skipped: 'amount_mismatch' } };
  }
  const r = await markOrderPaidViaStripe(order as any, paymentIntentId, sessionId);
  if (!r.ok) return { status: r.status, body: { error: r.error } };
  if (!r.alreadyPaid) {
    runOrderConfirmationSideEffects(order.id).catch((e) => console.error('[stripe-webhook] side effects failed:', e));
  }
  return { status: 200, body: { received: true, orderId: order.id, status: 'paid' } };
}

export async function POST(req: NextRequest) {
  try {
    const raw = await req.text(); // exact raw body is needed for the signature
    if (!verifyStripeWebhook(raw, req.headers.get('stripe-signature'))) {
      console.error('[stripe-webhook] invalid signature');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }
    const event = JSON.parse(raw);
    const obj = event?.data?.object || {};

    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded': {
        if (obj.payment_status !== 'paid') return NextResponse.json({ received: true, skipped: 'not_paid_yet' });
        const orderId = obj.metadata?.order_id || obj.client_reference_id;
        const pi = typeof obj.payment_intent === 'string' ? obj.payment_intent : obj.payment_intent?.id;
        if (!orderId || !pi) return NextResponse.json({ received: true, skipped: 'malformed_payload' });
        const out = await payIfMatches(orderId, pi, obj.id, obj.amount_total, obj.currency);
        return NextResponse.json(out.body, { status: out.status });
      }
      case 'payment_intent.succeeded': {
        const orderId = obj.metadata?.order_id;
        if (!orderId) return NextResponse.json({ received: true, skipped: 'no_order_metadata' });
        const out = await payIfMatches(orderId, obj.id, null, obj.amount_received ?? obj.amount, obj.currency);
        return NextResponse.json(out.body, { status: out.status });
      }
      case 'payment_intent.payment_failed': {
        // Order stays 'pending' so the customer can retry from the same order.
        console.warn(`[stripe-webhook] payment failed for order ${obj.metadata?.order_id}: ${obj.last_payment_error?.message || ''}`);
        return NextResponse.json({ received: true });
      }
      case 'checkout.session.expired': {
        console.info(`[stripe-webhook] session expired for order ${obj.metadata?.order_id}`);
        return NextResponse.json({ received: true });
      }
      case 'charge.refunded': {
        // Refunds started from our Admin are tracked by the admin flow itself; this is just an audit log
        // (covers refunds done directly in the Stripe dashboard).
        console.info(`[stripe-webhook] charge refunded: pi=${obj.payment_intent} refunded=${obj.amount_refunded} ${obj.currency}`);
        return NextResponse.json({ received: true });
      }
      case 'charge.dispute.created': {
        const pi = typeof obj.payment_intent === 'string' ? obj.payment_intent : obj.payment_intent?.id;
        if (pi) {
          const { error } = await getSupabaseAdmin()
            .from('orders')
            .update({ stripe_dispute_id: obj.id, stripe_dispute_status: obj.status || 'needs_response' })
            .eq('stripe_payment_intent_id', pi);
          if (error) console.error('[stripe-webhook] could not record dispute (run the stripe_disputes migration):', error.message);
        }
        console.warn(`[stripe-webhook] DISPUTE opened ${obj.id} for payment_intent ${pi}`);
        return NextResponse.json({ received: true });
      }
      default:
        return NextResponse.json({ received: true, skipped: event.type });
    }
  } catch (err) {
    console.error('[stripe-webhook] handler threw:', err);
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}
