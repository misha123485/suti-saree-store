import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAdminToken, ADMIN_SESSION_COOKIE } from '@/lib/admin-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { sendEmail } from '@/lib/email';
import { orderShippedInternationalEmail } from '@/lib/email-templates';
import { getUnshippedItemIndexes, DEFAULT_NEXT_LOT_MIN_DAYS, DEFAULT_NEXT_LOT_MAX_DAYS } from '@/lib/shipments';
import { INTL_COURIERS, intlTrackingUrl, safeHttpUrl } from '@/lib/intl-shipping';
import { normalizeInternationalSettings } from '@/lib/intl-api';

export const dynamic = 'force-dynamic';

const nonNegInt = (v: unknown): number | null => {
  if (v === undefined || v === null || v === '') return null;
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 0 ? n : NaN;
};

/**
 * Admin: record an INTERNATIONAL shipment (DHL / FedEx / Aramex / Shiprocket / other).
 * Counterpart of /api/admin/delhivery/create-shipment: same order_shipments rows (so split parcels keep
 * working), same status bump to 'shipped', same "shipped" email -- but no courier API call, the admin
 * types the AWB from the courier's own portal.
 */
export async function POST(req: Request) {
  const cookie = cookies().get(ADMIN_SESSION_COOKIE)?.value ?? null;
  const verified = await verifyAdminToken(cookie);
  if (!verified.valid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const orderId = String(body?.orderId ?? '');
  const courier = String(body?.courier ?? '');
  const awb = String(body?.awb ?? '').trim();
  if (!orderId) return NextResponse.json({ success: false, error: 'Missing orderId' }, { status: 200 });
  if (!(INTL_COURIERS as readonly string[]).includes(courier)) {
    return NextResponse.json({ success: false, error: 'Pick a courier' }, { status: 200 });
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9 _-]{3,39}$/.test(awb)) {
    return NextResponse.json({ success: false, error: 'AWB / tracking number must be 4-40 letters, digits, - or _' }, { status: 200 });
  }
  const courierName = courier === 'Other' ? String(body?.courierOther || 'Other').trim().slice(0, 40) || 'Other' : courier;

  let trackingUrl = safeHttpUrl(body?.trackingUrl);
  if (!trackingUrl) trackingUrl = intlTrackingUrl(courier, awb);
  if (body?.trackingUrl && !safeHttpUrl(body.trackingUrl)) {
    return NextResponse.json({ success: false, error: 'Tracking link must start with http:// or https://' }, { status: 200 });
  }

  const dispatch = body?.dispatchDate ? new Date(`${String(body.dispatchDate)}T00:00:00+05:30`) : new Date();
  if (Number.isNaN(dispatch.getTime())) {
    return NextResponse.json({ success: false, error: 'Invalid dispatch date' }, { status: 200 });
  }

  const courierCost = nonNegInt(body?.actualCourierCostInr);
  const dutyPaid = nonNegInt(body?.actualDutyPaidInr);
  if (Number.isNaN(courierCost) || Number.isNaN(dutyPaid)) {
    return NextResponse.json({ success: false, error: 'Courier cost / duty must be a positive number (INR)' }, { status: 200 });
  }
  const hs = String(body?.exportHsCode ?? '').trim();
  if (hs && !/^\d{4,10}(\.\d{1,4})?$/.test(hs)) {
    return NextResponse.json({ success: false, error: 'HS code should be 4-10 digits (e.g. 5407 or 54075200)' }, { status: 200 });
  }

  const supabase = getSupabaseAdmin();
  try {
    const { data: order, error: oErr } = await supabase.from('orders').select('*').eq('id', orderId).single();
    if (oErr || !order) return NextResponse.json({ success: false, error: 'Order not found' }, { status: 200 });
    if (!order.is_international) {
      return NextResponse.json({ success: false, error: 'This is an India order — use the Delhivery shipment instead.' }, { status: 200 });
    }
    // Never ship money we have not received (Stripe webhook flips pending -> paid).
    if (!['paid', 'shipped'].includes(order.status)) {
      return NextResponse.json(
        { success: false, error: `Order is "${order.status}" — it can be shipped only after Stripe payment is confirmed (status Paid).` },
        { status: 200 }
      );
    }

    const { data: priorRows, error: pErr } = await supabase
      .from('order_shipments')
      .select('shipment_no, item_indexes')
      .eq('order_id', orderId)
      .order('shipment_no', { ascending: true });
    if (pErr) throw pErr;
    const prior = priorRows ?? [];

    const items: any[] = Array.isArray(order.items) ? order.items : [];
    const unshipped = getUnshippedItemIndexes(items, prior as any);
    if (unshipped.length === 0) {
      return NextResponse.json({ success: false, error: 'All items of this order are already shipped.' }, { status: 200 });
    }
    const requested: number[] | null = Array.isArray(body?.itemIndexes)
      ? body.itemIndexes.map((n: unknown) => Number(n)).filter((n: number) => Number.isInteger(n) && n >= 0)
      : null;
    const selected = (requested ?? unshipped).filter((i, pos, arr) => arr.indexOf(i) === pos);
    if (selected.length === 0 || selected.some((i) => !unshipped.includes(i))) {
      return NextResponse.json({ success: false, error: 'Pick at least one item that has not been shipped yet.' }, { status: 200 });
    }
    const isPartial = selected.length < unshipped.length;
    const isFirst = prior.length === 0;
    const shipmentNo = prior.reduce((m: number, x: any) => Math.max(m, x.shipment_no), 0) + 1;
    const shipItems = selected.map((i) => items[i]);
    const nextMin = Math.max(1, Math.round(Number(body?.nextMinDays) || DEFAULT_NEXT_LOT_MIN_DAYS));
    const nextMax = Math.max(nextMin, Math.round(Number(body?.nextMaxDays) || DEFAULT_NEXT_LOT_MAX_DAYS));

    const { data: shipment, error: sErr } = await supabase
      .from('order_shipments')
      .insert({
        order_id: orderId,
        shipment_no: shipmentNo,
        waybill: awb,
        courier_name: courierName,
        item_indexes: selected,
        items: shipItems,
        cod_amount: 0,
        is_partial: isPartial,
        next_shipment_min_days: isPartial ? nextMin : null,
        next_shipment_max_days: isPartial ? nextMax : null,
        tracking_url: trackingUrl || null,
        dispatched_at: dispatch.toISOString(),
      })
      .select('*')
      .single();
    if (sErr) {
      const dup = /duplicate|unique/i.test(sErr.message || '');
      return NextResponse.json({ success: false, error: dup ? 'This AWB is already used on another parcel.' : sErr.message }, { status: 200 });
    }

    // Order-level fields. tracking_number keeps pointing at the FIRST parcel (same convention as Delhivery).
    const patch: Record<string, any> = {
      status: 'shipped',
      actual_courier_cost_inr: (Number(order.actual_courier_cost_inr) || 0) + (courierCost ?? 0),
    };
    if (isFirst) {
      patch.tracking_number = awb;
      patch.courier_name = courierName;
      patch.intl_courier = courierName;
      patch.intl_awb = awb;
      patch.intl_tracking_url = trackingUrl || null;
      patch.intl_dispatched_at = dispatch.toISOString();
    }
    if (hs) patch.export_hs_code = hs;
    if (dutyPaid !== null) patch.actual_duty_paid_inr = dutyPaid; // only meaningful for DDP; admin may leave blank
    const { error: uErr } = await supabase.from('orders').update(patch).eq('id', orderId);
    if (uErr) throw uErr;

    // Customer email (best effort -- never undoes the shipment).
    if (order.customer_email) {
      const cc = String(order.country_code || '').toUpperCase();
      const [{ data: zone }, { data: country }, { data: setRow }] = await Promise.all([
        supabase.from('shipping_zones').select('eta_min_days, eta_max_days').contains('countries', [cc]).eq('is_active', true).limit(1).maybeSingle(),
        supabase.from('intl_countries').select('name').eq('code', cc).maybeSingle(),
        supabase.from('settings').select('value').eq('key', 'international_settings').maybeSingle(),
      ]);
      const intl = normalizeInternationalSettings(setRow?.value as any);
      const { subject, html } = orderShippedInternationalEmail({
        id: order.id,
        customer_name: order.customer_name,
        courier_name: courierName,
        awb,
        tracking_url: trackingUrl,
        country_name: country?.name ?? null,
        duty_mode: order.duty_mode,
        eta_min_days: zone?.eta_min_days ?? null,
        eta_max_days: zone?.eta_max_days ?? null,
        return_days: intl.return_window_days_intl,
        shipped_items: shipItems,
        parcel_no: shipmentNo,
        is_partial: isPartial,
      });
      sendEmail({ to: order.customer_email, subject, html })
        .then(async (sent) => {
          if (!sent.success) return;
          const nowIso = new Date().toISOString();
          await supabase.from('order_shipments').update({ shipped_email_sent_at: nowIso }).eq('id', shipment.id);
          if (isFirst) await supabase.from('orders').update({ shipped_email_sent_at: nowIso }).eq('id', orderId);
        })
        .catch(() => {});
    }

    return NextResponse.json({
      success: true,
      waybill: awb,
      status: 'shipped',
      shipment,
      partial: isPartial,
      remaining_count: unshipped.length - selected.length,
    });
  } catch (err) {
    console.error('[international/ship] failed for order', orderId, err);
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : 'Failed to save shipment' }, { status: 200 });
  }
}
