import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin, toZone } from '@/lib/intl-server';
import { normalizeInternationalCosts, normalizeInternationalSettings } from '@/lib/intl-api';
import {
  computeOrderPnl, groupByCountry, sumRows, PNL_EXCLUDED_STATUSES,
  type PnlContext, type PnlOrderInput, type PnlRow,
} from '@/lib/intl-pnl';

// Admin-only. GET = international P&L (rows + totals + per-country), PUT = save the two manual inputs per order.
// Same guard as every other admin API (lib/admin-auth.ts via requireAdmin). Nothing here is public.
export const dynamic = 'force-dynamic';

const COLS =
  'id, created_at, status, country_code, charge_currency, charge_amount_minor, fx_rate_used, duty_mode, items, actual_courier_cost_inr, actual_duty_paid_inr, actual_settlement_inr, intl_ad_spend_inr, stripe_dispute_id, stripe_dispute_status';

const IST_MS = 5.5 * 60 * 60 * 1000;
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const validYmd = (s: string | null) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
/** IST calendar day boundary -> UTC ISO string. */
const istStart = (day: string) => new Date(Date.parse(`${day}T00:00:00Z`) - IST_MS).toISOString();
const addDay = (day: string) => ymd(new Date(Date.parse(`${day}T00:00:00Z`) + 86400000));

async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

const csvCell = (v: unknown) => {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function GET(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const url = new URL(req.url);
  const nowIst = new Date(Date.now() + IST_MS);
  const monthStart = `${ymd(nowIst).slice(0, 8)}01`;
  const summaryOnly = url.searchParams.get('summary') === 'month';
  const from = summaryOnly ? monthStart : validYmd(url.searchParams.get('from')) ? url.searchParams.get('from')! : monthStart;
  const to = summaryOnly ? ymd(nowIst) : validYmd(url.searchParams.get('to')) ? url.searchParams.get('to')! : ymd(nowIst);
  const country = (url.searchParams.get('country') || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2);
  if (to < from) return NextResponse.json({ error: '"to" must be on or after "from"' }, { status: 400 });

  try {
    const db = getSupabaseAdmin();
    const [{ data: sRow }, { data: cRow }, { data: shipRow }, { data: zoneRows }] = await Promise.all([
      db.from('settings').select('value').eq('key', 'international_settings').maybeSingle(),
      db.from('settings').select('value').eq('key', 'international_costs').maybeSingle(),
      db.from('settings').select('value').eq('key', 'shipping').maybeSingle(),
      db.from('shipping_zones').select('*'),
    ]);
    const settings = normalizeInternationalSettings(sRow?.value as never);
    const costs = normalizeInternationalCosts(cRow?.value as never);
    const packagingInr = Math.max(Number((shipRow?.value as { other_charges?: number } | null)?.other_charges) || 0, 0);
    const zones = (zoneRows || []).map((r) => toZone(r as Record<string, unknown>));

    const orders = await fetchAll<Omit<PnlOrderInput, 'refunds_inr'>>((f, t) => {
      let q = db.from('orders').select(COLS).eq('is_international', true)
        .gte('created_at', istStart(from)).lt('created_at', istStart(addDay(to)))
        .not('status', 'in', `(${PNL_EXCLUDED_STATUSES.join(',')})`)
        .order('created_at', { ascending: false });
      if (country) q = q.eq('country_code', country);
      return q.range(f, t) as never;
    });

    const ids = orders.map((o) => o.id);
    const refundByOrder = new Map<string, number>();
    const productIds = new Set<string>();
    for (const o of orders) for (const it of Array.isArray(o.items) ? o.items : []) if (it?.product_id) productIds.add(String(it.product_id));
    for (let i = 0; i < ids.length; i += 200) {
      const { data } = await db.from('returns').select('order_id, refund_amount, status').in('order_id', ids.slice(i, i + 200)).in('status', ['refunded', 'completed']);
      for (const r of data || []) refundByOrder.set(r.order_id as string, (refundByOrder.get(r.order_id as string) || 0) + (Number(r.refund_amount) || 0));
    }
    const productCost = new Map<string, number>();
    const pids = Array.from(productIds);
    for (let i = 0; i < pids.length; i += 200) {
      const { data } = await db.from('product_costs').select('product_id, cost_inr').in('product_id', pids.slice(i, i + 200));
      for (const r of data || []) productCost.set(String(r.product_id), Number(r.cost_inr) || 0);
    }

    const ctx: PnlContext = { costs, settings, productCost, packagingInr, zones };
    const rows: PnlRow[] = orders.map((o) => computeOrderPnl({ ...o, refunds_inr: refundByOrder.get(o.id) || 0 }, ctx));
    const totals = sumRows(rows);

    if (summaryOnly) {
      return NextResponse.json({ enabled: settings.international_enabled, from, to, orders: totals.orders, revenue: totals.revenue, profit: totals.profit, margin_percent: totals.margin_percent });
    }

    if (url.searchParams.get('format') === 'csv') {
      const head = ['order', 'date', 'country', 'currency', 'charged', 'revenue_inr', 'stripe_fee_inr', 'fx_loss_inr', 'product_cost_inr', 'packaging_inr', 'courier_inr', 'duty_inr', 'refunds_inr', 'chargeback_inr', 'ad_spend_inr', 'profit_inr', 'margin_percent', 'notes'];
      const lines = [head.join(',')];
      for (const r of rows) {
        const notes = [r.flags.cost_missing && 'cost missing', r.flags.courier_estimated && 'courier estimated', r.flags.settlement_actual && 'actual settlement', r.flags.disputed && 'disputed'].filter(Boolean).join('; ');
        lines.push([r.order_number, r.created_at.slice(0, 10), r.country, r.currency, r.charge_major, r.revenue, r.fees, r.fx_loss, r.cogs, r.packaging, r.courier, r.duty, r.refunds, r.chargeback, r.ad_spend, r.profit, r.margin_percent, notes].map(csvCell).join(','));
      }
      const t = totals;
      lines.push(['TOTAL', '', '', '', '', t.revenue, t.fees, t.fx_loss, t.cogs, t.packaging, t.courier, t.duty, t.refunds, t.chargeback, t.ad_spend, t.profit, t.margin_percent, ''].map(csvCell).join(','));
      return new NextResponse(lines.join('\n'), {
        headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="international-pnl-${from}_to_${to}.csv"` },
      });
    }

    return NextResponse.json({ from, to, country, rows, totals, byCountry: groupByCountry(rows), packagingInr });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'P&L load failed' }, { status: 500 });
  }
}

/** Save the manual inputs: actual_settlement_inr (net INR Stripe paid out) and intl_ad_spend_inr. null/'' clears settlement. */
export async function PUT(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { orderId?: string; actual_settlement_inr?: unknown; intl_ad_spend_inr?: unknown } | null;
  if (!body?.orderId || typeof body.orderId !== 'string') return NextResponse.json({ error: 'orderId required' }, { status: 400 });
  const patch: Record<string, number | null> = {};
  if ('actual_settlement_inr' in body) {
    if (body.actual_settlement_inr === null || body.actual_settlement_inr === '') patch.actual_settlement_inr = null;
    else {
      const n = Math.round(Number(body.actual_settlement_inr));
      if (!Number.isFinite(n) || n < 0 || n > 100000000) return NextResponse.json({ error: 'Invalid settlement amount' }, { status: 400 });
      patch.actual_settlement_inr = n;
    }
  }
  if ('intl_ad_spend_inr' in body) {
    const n = Math.round(Number(body.intl_ad_spend_inr ?? 0));
    if (!Number.isFinite(n) || n < 0 || n > 100000000) return NextResponse.json({ error: 'Invalid ad spend' }, { status: 400 });
    patch.intl_ad_spend_inr = n;
  }
  if (!Object.keys(patch).length) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  const { data, error } = await getSupabaseAdmin().from('orders').update(patch).eq('id', body.orderId).eq('is_international', true).select('id');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data?.length) return NextResponse.json({ error: 'International order not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
