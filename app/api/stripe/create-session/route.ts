import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { isStripeConfigured, normalizeStripeMinor, stripeFetch } from '@/lib/stripe';
import { syncStripeOrderIfPending } from '@/lib/stripe-sync';
import { normalizeInternationalSettings } from '@/lib/intl-api';

// Stripe Checkout for INTERNATIONAL orders only. Same security model as /api/cashfree/create-order:
// the amount and currency are read from the `orders` row (written by place_order_with_items()),
// NEVER from the client.
//
// Stripe India rules: billing AND shipping address must be outside India, a description is
// required, cards must be issued outside India, 3D Secure stays on (we never disable it).

// Tiny per-instance rate limit (serverless-friendly best effort): 8 calls / minute / IP.
const hits = new Map<string, number[]>();
function limited(ip: string): boolean {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < 60_000);
  arr.push(now);
  hits.set(ip, arr);
  if (hits.size > 5000) hits.clear();
  return arr.length > 8;
}

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get('x-nf-client-connection-ip') || req.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
    if (limited(ip)) return NextResponse.json({ error: 'Too many attempts. Please wait a minute.' }, { status: 429 });

    const { internalOrderId } = await req.json().catch(() => ({}));
    if (!internalOrderId || typeof internalOrderId !== 'string') {
      return NextResponse.json({ error: 'internalOrderId is required' }, { status: 400 });
    }
    if (!isStripeConfigured()) {
      return NextResponse.json({ error: 'Card payments are not configured yet.' }, { status: 500 });
    }

    const admin = getSupabaseAdmin();
    const { data: order, error } = await admin
      .from('orders')
      .select(
        'id, status, items, payment_method, is_international, country_code, charge_currency, charge_amount_minor, customer_name, customer_email, customer_phone, shipping_address, stripe_session_id',
      )
      .eq('id', internalOrderId)
      .maybeSingle();
    if (error || !order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });

    if (!order.is_international || !order.country_code || order.country_code === 'IN') {
      return NextResponse.json({ error: 'Stripe is only for international orders' }, { status: 400 });
    }
    if (order.payment_method !== 'online') {
      return NextResponse.json({ error: 'International orders must be paid online' }, { status: 400 });
    }
    if (order.status !== 'pending') {
      return NextResponse.json({ error: `Order is already ${order.status}; cannot create a new payment for it` }, { status: 409 });
    }
    const addr = (order.shipping_address || {}) as Record<string, any>;
    const addrCountry = String(addr.country || '').trim().toLowerCase();
    if (addrCountry === 'india' || addrCountry === 'in') {
      return NextResponse.json({ error: 'Stripe cannot be used for addresses in India' }, { status: 400 });
    }

    // Kill-switch: if International Selling was turned off (or this country disabled) after the order was
    // placed, do not open a new payment for it. Already-paid orders are unaffected (handled above/webhook).
    const [{ data: sRow }, { data: cRow }] = await Promise.all([
      admin.from('settings').select('value').eq('key', 'international_settings').maybeSingle(),
      admin.from('intl_countries').select('is_enabled').eq('code', order.country_code).maybeSingle(),
    ]);
    if (!normalizeInternationalSettings(sRow?.value as never).international_enabled || !cRow?.is_enabled) {
      return NextResponse.json({ error: 'International orders are currently unavailable for this country.' }, { status: 409 });
    }

    // Products flagged "export blocked" can never be paid for through the international path.
    const itemIds = Array.from(new Set(((Array.isArray((order as { items?: unknown }).items) ? (order as { items: Array<{ product_id?: string }> }).items : []) as Array<{ product_id?: string }>).map((i) => i?.product_id).filter((x): x is string => !!x)));
    if (itemIds.length) {
      const { data: blocked } = await admin.from('products').select('name').in('id', itemIds).eq('export_blocked', true);
      if (blocked && blocked.length) {
        return NextResponse.json({ error: `Not available for international delivery: ${blocked.map((b) => b.name).join(', ')}. Please remove it from your cart.` }, { status: 409 });
      }
    }

    const currency = String(order.charge_currency || '').toUpperCase();
    const amountMinor = normalizeStripeMinor(Number(order.charge_amount_minor), currency);
    if (!currency || currency === 'INR' || !amountMinor || amountMinor < 1) {
      return NextResponse.json({ error: 'Order has an invalid amount' }, { status: 400 });
    }

    // Retry / back-button: reuse the still-open session instead of creating another one.
    let prevSessionId: string | null = order.stripe_session_id || null;
    if (prevSessionId) {
      const prev = await stripeFetch<any>('GET', `/checkout/sessions/${encodeURIComponent(prevSessionId)}`);
      if (prev.ok) {
        if (prev.data.payment_status === 'paid') {
          await syncStripeOrderIfPending(order.id).catch(() => {});
          return NextResponse.json({ alreadyPaid: true, url: `/order-confirmation/${order.id}?stripe=success` });
        }
        if (prev.data.status === 'open' && prev.data.url) {
          return NextResponse.json({ success: true, url: prev.data.url, sessionId: prev.data.id, reused: true });
        }
      }
    }

    const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || req.nextUrl.origin).replace(/\/$/, '');
    const shortNo = order.id.slice(0, 8).toUpperCase();
    const description = `Sutisaree sarees – export order #${shortNo}`;
    const shippingAddr = {
      line1: String(addr.address || '').slice(0, 200) || 'N/A',
      line2: addr.address2 ? String(addr.address2).slice(0, 200) : undefined,
      city: String(addr.city || '').slice(0, 100) || undefined,
      state: String(addr.state || '').slice(0, 100) || undefined,
      postal_code: String(addr.pincode || '').slice(0, 20) || undefined,
      country: order.country_code,
    };

    const created = await stripeFetch<any>(
      'POST',
      '/checkout/sessions',
      {
        mode: 'payment',
        payment_method_types: ['card'],
        client_reference_id: order.id,
        customer_email: order.customer_email || undefined,
        billing_address_collection: 'required',
        expires_at: Math.floor(Date.now() / 1000) + 60 * 60,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: currency.toLowerCase(),
              unit_amount: amountMinor,
              product_data: { name: `Sutisaree order #${shortNo}`, description: 'Handloom sarees (export)' },
            },
          },
        ],
        metadata: { order_id: order.id, country_code: order.country_code },
        payment_intent_data: {
          description,
          metadata: { order_id: order.id },
          shipping: { name: order.customer_name || 'Customer', phone: order.customer_phone || undefined, address: shippingAddr },
        },
        success_url: `${siteUrl}/order-confirmation/${order.id}?stripe=success`,
        cancel_url: `${siteUrl}/checkout`,
      },
      // One idempotency key per (order, previous session) => double-click safe, retry after expiry gets a new session.
      { idempotencyKey: `cs_${order.id}_${prevSessionId || 'first'}` },
    );
    if (!created.ok) {
      return NextResponse.json({ error: created.error }, { status: created.status >= 400 && created.status < 600 ? created.status : 500 });
    }

    const { error: updErr } = await admin
      .from('orders')
      .update({ stripe_session_id: created.data.id, payment_gateway: 'stripe' })
      .eq('id', order.id)
      .eq('status', 'pending');
    if (updErr) return NextResponse.json({ error: 'Failed to link payment session' }, { status: 500 });

    return NextResponse.json({ success: true, url: created.data.url, sessionId: created.data.id });
  } catch (err) {
    console.error('[stripe/create-session] failed:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Could not start the card payment. Please try again.' }, { status: 500 });
  }
}
