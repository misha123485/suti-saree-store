import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { getCurrentUser } from '@/lib/supabase-server-auth';
import { generateInvoicePdf } from '@/lib/invoice-pdf';
import { generateExportInvoicePdf } from '@/lib/export-invoice-pdf';
import { normalizeExportDetails } from '@/lib/intl-api';
import { DEFAULT_LOYALTY_SETTINGS, type LoyaltySettings } from '@/lib/loyalty-api';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    // NOTE: this route is hit via a plain `<a href download>` from three
    // different places -- the logged-in account/orders pages, AND the
    // guest-accessible order-confirmation/track pages (no login, the order
    // id itself is the access token, same trust model as
    // orders/[id]/cancel/route.ts). A cookie-aware client alone would 404
    // for guests, and the plain anon-key client (the old bug here) 404s for
    // everyone since the 20260827 RLS lockdown dropped anon SELECT on
    // orders. So: fetch with the service-role client, then check ownership
    // in code.
    const supabase = getSupabaseAdmin();
    const user = await getCurrentUser();

    const { data: order, error } = await supabase
      .from('orders')
      .select('*')
      .eq('id', params.id)
      .single();

    if (error || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    if (order.user_id) {
      // Account order -- must be logged in as the owner (or same email).
      if (!user) {
        return NextResponse.json({ error: 'You must be logged in to view this invoice.' }, { status: 401 });
      }
      const ownsByEmail =
        !!order.customer_email && !!user.email && order.customer_email.toLowerCase() === user.email.toLowerCase();
      if (order.user_id !== user.id && !ownsByEmail) {
        return NextResponse.json({ error: 'Order not found' }, { status: 404 });
      }
    }
    // else: guest order (user_id is null) -- proceed, no login required.

    // International orders get the EXPORT invoice (LUT, IEC, HS codes, charge currency + INR).
    // export_details is admin-only in the settings table, so it is read here with the service role.
    if (order.is_international) {
      const [{ data: storeRow }, { data: exportRow }] = await Promise.all([
        supabase.from('settings').select('value').eq('key', 'store_info').maybeSingle(),
        supabase.from('settings').select('value').eq('key', 'export_details').maybeSingle(),
      ]);
      const storeInfo = (storeRow?.value as Record<string, string>) || {};
      const exp = normalizeExportDetails(exportRow?.value as any);
      const bytes = await generateExportInvoicePdf(
        {
          id: order.id,
          created_at: order.created_at,
          status: order.status,
          items: Array.isArray(order.items) ? order.items : [],
          customer_name: order.customer_name,
          customer_email: order.customer_email,
          customer_phone: order.customer_phone,
          shipping_address: order.shipping_address,
          total_amount: Number(order.total_amount) || 0,
          intl_shipping_inr: order.intl_shipping_inr,
          coupon_discount: order.coupon_discount,
          country_code: order.country_code,
          charge_currency: order.charge_currency || 'USD',
          charge_amount_minor: Number(order.charge_amount_minor) || 0,
          fx_rate_used: order.fx_rate_used,
          duty_mode: order.duty_mode,
          export_hs_code: order.export_hs_code,
          intl_courier: order.intl_courier,
          intl_awb: order.intl_awb,
        },
        {
          name: storeInfo.name,
          address: storeInfo.address,
          gstin: exp.gstin || storeInfo.gstin,
          support_email: storeInfo.support_email,
          support_phone: storeInfo.support_phone,
          iec: exp.iec,
          lut_number: exp.lut_number,
          lut_date: exp.lut_date,
          ad_code: exp.ad_code,
          default_hs_code: exp.default_hs_code,
        }
      );
      return new NextResponse(Buffer.from(bytes), {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="export-invoice-${order.id.slice(0, 8)}.pdf"`,
          'Cache-Control': 'no-store',
        },
      });
    }

    const [{ data: storeSetting }, { data: loyaltySettingRow }] = await Promise.all([
      supabase.from('settings').select('value').eq('key', 'store_info').maybeSingle(),
      supabase.from('settings').select('value').eq('key', 'loyalty_program').maybeSingle(),
    ]);

    const store = (storeSetting?.value as Record<string, string>) || {};

    // Same projection formula already shown on the order-confirmation and
    // track pages (points_per_100_rupees on total_amount) -- this is a
    // preview of what the order WILL earn once delivered, not a claim that
    // it has already been credited. See lib/loyalty-api.ts.
    const loyaltySettings: LoyaltySettings = {
      ...DEFAULT_LOYALTY_SETTINGS,
      ...((loyaltySettingRow?.value as Partial<LoyaltySettings>) ?? {}),
    };
    const orderTotal = Number(order.total_amount) || 0;
    const projectedPoints = Math.floor((orderTotal * loyaltySettings.points_per_100_rupees) / 100);

    const pdfBytes = await generateInvoicePdf(
      {
        id: order.id,
        created_at: order.created_at,
        items: Array.isArray(order.items) ? order.items : [],
        customer_name: order.customer_name,
        customer_email: order.customer_email,
        customer_phone: order.customer_phone,
        shipping_address: order.shipping_address,
        subtotal: order.subtotal,
        coupon_code: order.coupon_code,
        coupon_discount: order.coupon_discount,
        shipping_charge: order.shipping_charge,
        gst_amount: order.gst_amount,
        total_amount: order.total_amount,
        payment_method: order.payment_method,
        payment_status: order.status,
        advance_amount: order.advance_amount,
        balance_due: order.balance_due,
        advance_paid_at: order.advance_paid_at,
      },
      store,
      loyaltySettings.enabled
        ? { pointsEarned: projectedPoints, redeemValuePerPoint: loyaltySettings.redeem_value_per_point }
        : null
    );

    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="invoice-${order.id.slice(0, 8)}.pdf"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    // Logged server-side so a bad invoice (e.g. a legacy/cancelled order with
    // a malformed item) can actually be diagnosed instead of just showing up
    // as a failed download with no trace.
    console.error('[invoice] generation failed for order', params.id, err);
    const message = err instanceof Error ? err.message : 'Failed to generate invoice';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
