import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAdminToken, ADMIN_SESSION_COOKIE } from '@/lib/admin-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import {
  DASHBOARD_IDS,
  DashboardId,
  DashboardSettings,
  DashboardsResponse,
  KpiData,
  LiveData,
  MarketingData,
  StoreData,
  mergeDashboardSettings,
} from '@/lib/dashboards-config';

export const dynamic = 'force-dynamic';

const SETTINGS_KEY = 'analytics_dashboards';

// ── Free-tier friendliness ──────────────────────────────────────────────────
// * Only the dashboards switched ON in settings are computed at all.
// * One lean orders query (no `items` blob) is shared by all dashboards.
// * Marketing counts use `head: true` count queries (no rows transferred).
// * Results are cached in memory for 30s, so many tabs / quick refreshes
//   cost a single set of Supabase queries.
const CACHE_TTL_MS = 30_000;
const cache = new Map<string, { at: number; payload: DashboardsResponse }>();

const IST_MS = 330 * 60_000;
const DAY_MS = 86_400_000;
const NOT_SALES = ['cancelled', 'failed', 'refunded'];
const CANCEL_STATUSES = ['cancelled', 'failed'];
const UNFULFILLED = ['pending', 'paid', 'packed', 'processing', 'confirmed'];
const MAX_ORDER_PAGES = 6; // 6 x 1000 rows per request cycle (a month of orders)

async function requireAdmin() {
  const cookie = cookies().get(ADMIN_SESSION_COOKIE)?.value ?? null;
  const verified = await verifyAdminToken(cookie);
  return verified.valid;
}

// ── IST date helpers (store is in India; Vercel runs in UTC) ───────────────
function istParts(d: Date) {
  const x = new Date(d.getTime() + IST_MS);
  return { y: x.getUTCFullYear(), m: x.getUTCMonth(), d: x.getUTCDate(), h: x.getUTCHours(), dow: x.getUTCDay() };
}
function istDayStart(d: Date, addDays = 0) {
  const p = istParts(d);
  return new Date(Date.UTC(p.y, p.m, p.d + addDays) - IST_MS);
}
function istMonthStart(d: Date, addMonths = 0) {
  const p = istParts(d);
  return new Date(Date.UTC(p.y, p.m + addMonths, 1) - IST_MS);
}
function daysInMonth(y: number, m: number) {
  return new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
}
const dayLabel = (d: Date) => new Date(d.getTime() + IST_MS).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });

type OrderRow = {
  id: string;
  total_amount: number | null;
  status: string;
  created_at: string;
  shipping_address: any;
  payment_method: string | null;
  coupon_code: string | null;
  coupon_discount: number | null;
  shipping_charge: number | null;
  gst_amount: number | null;
  attribution: any;
};

const isSale = (o: OrderRow) => !NOT_SALES.includes(o.status);
const amt = (o: OrderRow) => o.total_amount || 0;
const sum = (rows: OrderRow[]) => rows.reduce((s, o) => s + amt(o), 0);
const inRange = (o: OrderRow, from: Date, to: Date) => {
  const t = new Date(o.created_at).getTime();
  return t >= from.getTime() && t < to.getTime();
};
const top = (map: Map<string, number>, n: number) =>
  Array.from(map.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, n);
const bump = (map: Map<string, number>, k: string, v = 1) => map.set(k, (map.get(k) ?? 0) + v);
const cleanCoupons = (c: string | null) =>
  (c ?? '').split('+').map((s) => s.trim().toUpperCase()).filter(Boolean);

async function fetchOrders(from: Date): Promise<OrderRow[]> {
  const supabase = getSupabaseAdmin();
  const out: OrderRow[] = [];
  for (let page = 0; page < MAX_ORDER_PAGES; page++) {
    const { data, error } = await supabase
      .from('orders')
      .select('id,total_amount,status,created_at,shipping_address,payment_method,coupon_code,coupon_discount,shipping_charge,gst_amount,attribution')
      .gte('created_at', from.toISOString())
      .order('created_at', { ascending: false })
      .range(page * 1000, page * 1000 + 999);
    if (error) throw error;
    out.push(...((data as OrderRow[]) ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

async function countEvents(type: string, from: Date, to?: Date): Promise<number> {
  let q = getSupabaseAdmin()
    .from('activity_events')
    .select('id', { count: 'exact', head: true })
    .eq('event_type', type)
    .gte('created_at', from.toISOString());
  if (to) q = q.lt('created_at', to.toISOString());
  const { count, error } = await q;
  if (error) throw error;
  return count ?? 0;
}

async function countRows(table: string, apply?: (q: any) => any): Promise<number> {
  let q: any = getSupabaseAdmin().from(table).select('id', { count: 'exact', head: true });
  if (apply) q = apply(q);
  const { count, error } = await q;
  if (error) throw error;
  return count ?? 0;
}

const channelOf = (o: OrderRow) => o.attribution?.last?.channel || o.attribution?.first?.channel || 'Direct / Unknown';
const mediumOf = (o: OrderRow) => o.attribution?.last?.medium || o.attribution?.first?.medium || 'direct';
const paymentOf = (o: OrderRow) => ((o.payment_method || 'cod').toLowerCase() === 'cod' ? 'Cash on Delivery' : 'Online (Prepaid)');

// ── 1. Ecommerce KPI ────────────────────────────────────────────────────────
function buildKpi(orders: OrderRow[], now: Date): KpiData {
  const sales = orders.filter(isSale);
  const todayStart = istDayStart(now);
  const lastWeekStart = istDayStart(now, -7);
  const lastWeekEnd = istDayStart(now, -6);

  const today = sales.filter((o) => inRange(o, todayStart, new Date(todayStart.getTime() + DAY_MS)));
  const lastWeekDay = sales.filter((o) => inRange(o, lastWeekStart, lastWeekEnd));

  const p = istParts(now);
  const monthStart = istMonthStart(now);
  const lastMonthStart = istMonthStart(now, -1);
  const lastMonthDays = daysInMonth(p.m === 0 ? p.y - 1 : p.y, (p.m + 11) % 12);
  const month = sales.filter((o) => new Date(o.created_at) >= monthStart);
  const lastMonthAll = sales.filter((o) => inRange(o, lastMonthStart, monthStart));
  const lastMonthSoFar = lastMonthAll.filter((o) => istParts(new Date(o.created_at)).d <= p.d);

  const n = Math.max(p.d, lastMonthDays);
  const salesByDay = Array.from({ length: n }, (_, i) => ({ day: i + 1, thisMonth: 0 as number | null, lastMonth: 0 }));
  const ordersByDay = Array.from({ length: n }, (_, i) => ({ day: i + 1, thisMonth: 0 as number | null, lastMonth: 0 }));
  for (const o of month) {
    const d = istParts(new Date(o.created_at)).d - 1;
    if (salesByDay[d]) { (salesByDay[d].thisMonth as number) += amt(o); (ordersByDay[d].thisMonth as number) += 1; }
  }
  for (const o of lastMonthAll) {
    const d = istParts(new Date(o.created_at)).d - 1;
    if (salesByDay[d]) { salesByDay[d].lastMonth += amt(o); ordersByDay[d].lastMonth += 1; }
  }
  for (let i = p.d; i < n; i++) { salesByDay[i].thisMonth = null; ordersByDay[i].thisMonth = null; }

  const pay = new Map<string, number>(), state = new Map<string, number>(), src = new Map<string, number>();
  for (const o of month) {
    bump(pay, paymentOf(o));
    const st = String(o.shipping_address?.state || '').trim() || 'Unknown';
    bump(state, st, amt(o));
    bump(src, channelOf(o), amt(o));
  }
  const aovOf = (rows: OrderRow[]) => (rows.length ? Math.round(sum(rows) / rows.length) : 0);

  return {
    todaySales: { value: sum(today), prev: sum(lastWeekDay) },
    todayOrders: { value: today.length, prev: lastWeekDay.length },
    monthSales: { value: sum(month), prev: sum(lastMonthSoFar) },
    aov: { value: aovOf(month), prev: aovOf(lastMonthAll) },
    salesByDay,
    ordersByDay,
    byPayment: top(pay, 4),
    byState: top(state, 6),
    bySource: top(src, 6),
    costs: {
      shipping: month.reduce((s, o) => s + (o.shipping_charge || 0), 0),
      discounts: month.reduce((s, o) => s + (o.coupon_discount || 0), 0),
      gst: month.reduce((s, o) => s + (o.gst_amount || 0), 0),
    },
  };
}

// ── 2. Store overview ───────────────────────────────────────────────────────
async function buildStore(orders: OrderRow[], now: Date): Promise<StoreData> {
  const sales = orders.filter(isSale);
  const todayStart = istDayStart(now);
  const yStart = istDayStart(now, -1);
  const weekStart = istDayStart(now, -6);
  const prevWeekStart = istDayStart(now, -13);

  const salesToday = sum(sales.filter((o) => new Date(o.created_at) >= todayStart));
  const salesYesterday = sum(sales.filter((o) => inRange(o, yStart, todayStart)));
  const weekOrders = sales.filter((o) => new Date(o.created_at) >= weekStart);
  const prevWeekOrders = sales.filter((o) => inRange(o, prevWeekStart, weekStart));

  const weekTrend = Array.from({ length: 7 }, (_, i) => {
    const s = istDayStart(now, i - 6);
    const e = istDayStart(now, i - 5);
    return { label: dayLabel(s), value: sum(weekOrders.filter((o) => inRange(o, s, e))) };
  });

  // Best sellers: only this week's `items` are pulled (small, bounded query).
  const supabase = getSupabaseAdmin();
  const { data: itemRows, error } = await supabase
    .from('orders')
    .select('items,status')
    .gte('created_at', weekStart.toISOString())
    .not('status', 'in', `(${NOT_SALES.join(',')})`)
    .limit(2000);
  if (error) throw error;
  const sellers = new Map<string, number>();
  for (const r of itemRows ?? []) {
    for (const it of Array.isArray((r as any).items) ? (r as any).items : []) {
      const name = it.product_name || it.name;
      if (name) bump(sellers, String(name).slice(0, 40), Number(it.quantity) || 1);
    }
  }

  const pending = orders.filter((o) => UNFULFILLED.includes(o.status));
  const unfulfilled = pending.slice(0, 7).map((o) => ({
    id: o.id,
    short: o.id.slice(0, 8).toUpperCase(),
    status: o.status,
    amount: amt(o),
    payment: (o.payment_method || 'cod').toUpperCase(),
    coupon: cleanCoupons(o.coupon_code)[0] ?? null,
  }));

  const p = istParts(now);
  const monthStart = istMonthStart(now);
  const lastMonthStart = istMonthStart(now, -1);
  const cancelThis = orders.filter((o) => CANCEL_STATUSES.includes(o.status) && new Date(o.created_at) >= monthStart);
  const cancelLast = orders.filter(
    (o) => CANCEL_STATUSES.includes(o.status) && inRange(o, lastMonthStart, monthStart) && istParts(new Date(o.created_at)).d <= p.d
  );
  const returnsCount = await countRows('returns', (q) => q.gte('created_at', monthStart.toISOString())).catch(() => 0);
  const cancelReasons = [
    { name: 'Cancelled by customer / admin', value: cancelThis.filter((o) => o.status === 'cancelled').length },
    { name: 'Payment failed', value: cancelThis.filter((o) => o.status === 'failed').length },
    { name: 'Return / exchange requests', value: returnsCount },
  ];

  // Top coupon this week (by number of orders)
  const couponOrders = new Map<string, number>();
  for (const o of weekOrders) for (const c of cleanCoupons(o.coupon_code)) bump(couponOrders, c);
  const topCode = top(couponOrders, 1)[0]?.name;
  const topCoupon = topCode
    ? {
        code: topCode,
        total: sum(weekOrders.filter((o) => cleanCoupons(o.coupon_code).includes(topCode))),
        trend: weekTrend.map((d, i) => {
          const s = istDayStart(now, i - 6);
          const e = istDayStart(now, i - 5);
          return { label: d.label, value: sum(weekOrders.filter((o) => cleanCoupons(o.coupon_code).includes(topCode) && inRange(o, s, e))) };
        }),
      }
    : null;

  const aov = (rows: OrderRow[]) => (rows.length ? Math.round(sum(rows) / rows.length) : 0);
  return {
    salesToday: { value: salesToday, prev: salesYesterday },
    weekTrend,
    aovWeek: aov(weekOrders),
    aovPrevWeek: aov(prevWeekOrders),
    bestSellers: top(sellers, 8),
    unfulfilled,
    unfulfilledTotal: pending.length,
    cancellations: { value: cancelThis.length, prev: cancelLast.length },
    cancelReasons,
    topCoupon,
  };
}

// ── 3. Marketing ────────────────────────────────────────────────────────────
async function buildMarketing(orders: OrderRow[], now: Date): Promise<MarketingData> {
  const supabase = getSupabaseAdmin();
  const weekStart = istDayStart(now, -6);
  const weekOrders = orders.filter((o) => isSale(o) && new Date(o.created_at) >= weekStart);

  const types: [string, string][] = [
    ['page_view', 'Visited'],
    ['product_view', 'Viewed a product'],
    ['add_to_cart', 'Added to cart'],
    ['checkout_start', 'Started checkout'],
    ['purchase', 'Purchased'],
  ];
  const [funnelCounts, visits, abandoned, subTotal, subWeek, reviews] = await Promise.all([
    Promise.all(types.map(([t]) => countEvents(t, weekStart))),
    Promise.all(
      Array.from({ length: 7 }, (_, i) => countEvents('page_view', istDayStart(now, i - 6), istDayStart(now, i - 5)))
    ),
    supabase
      .from('abandoned_carts')
      .select('cart_value,recovered')
      .gte('created_at', weekStart.toISOString())
      .eq('recovered', false)
      .limit(1000)
      .then((r) => r.data ?? []),
    countRows('newsletter_subscribers').catch(() => 0),
    countRows('newsletter_subscribers', (q) => q.gte('created_at', weekStart.toISOString())).catch(() => 0),
    supabase
      .from('reviews')
      .select('customer_name,rating,comment,created_at')
      .eq('is_approved', true)
      .order('created_at', { ascending: false })
      .limit(3)
      .then((r) => r.data ?? []),
  ]);

  const addToCart = funnelCounts[2];
  const medium = new Map<string, number>();
  for (const o of weekOrders) bump(medium, String(mediumOf(o)).toLowerCase());

  return {
    funnel: types.map(([, label], i) => ({ name: label, value: funnelCounts[i] })),
    cartAbandonment: addToCart > 0 ? Math.max(0, Math.min(100, Math.round((1 - weekOrders.length / addToCart) * 100))) : 0,
    abandonedValue: (abandoned as any[]).reduce((s, r) => s + (r.cart_value || 0), 0),
    abandonedCount: (abandoned as any[]).length,
    visitsTrend: visits.map((v, i) => ({ label: dayLabel(istDayStart(now, i - 6)), value: v })),
    byMedium: top(medium, 6),
    subscribers: { total: subTotal, thisWeek: subWeek },
    reviews: (reviews as any[]).map((r) => ({
      name: r.customer_name || 'Customer',
      rating: r.rating,
      text: String(r.comment || '').slice(0, 110),
      at: r.created_at,
    })),
    aovWeek: weekOrders.length ? Math.round(sum(weekOrders) / weekOrders.length) : 0,
  };
}

// ── 4. Live sale monitor ────────────────────────────────────────────────────
async function buildLive(orders: OrderRow[], now: Date, target: number): Promise<LiveData> {
  const supabase = getSupabaseAdmin();
  const todayStart = istDayStart(now);
  const todaySales = orders.filter((o) => isSale(o) && new Date(o.created_at) >= todayStart);

  const hourly = Array.from({ length: istParts(now).h + 1 }, (_, h) => ({ hour: h, value: 0 }));
  const coupons = new Map<string, number>();
  for (const o of todaySales) {
    const h = istParts(new Date(o.created_at)).h;
    if (hourly[h]) hourly[h].value += 1;
    for (const c of cleanCoupons(o.coupon_code)) bump(coupons, c, amt(o));
  }

  const [recent, pages, openTickets, newMessages] = await Promise.all([
    supabase
      .from('activity_events')
      .select('session_id')
      .gte('created_at', new Date(now.getTime() - 5 * 60_000).toISOString())
      .limit(2000)
      .then((r) => r.data ?? []),
    supabase
      .from('activity_events')
      .select('page_path')
      .eq('event_type', 'page_view')
      .gte('created_at', todayStart.toISOString())
      .limit(3000)
      .then((r) => r.data ?? []),
    countRows('support_tickets', (q) => q.in('status', ['open', 'in_progress'])).catch(() => 0),
    countRows('contact_messages', (q) => q.eq('status', 'new')).catch(() => 0),
  ]);

  const pageMap = new Map<string, number>();
  for (const r of pages as any[]) {
    const path = String(r.page_path || '').split('?')[0];
    if (path && !path.startsWith('/admin')) bump(pageMap, path.length > 34 ? path.slice(0, 34) + '…' : path);
  }

  return {
    salesToday: sum(todaySales),
    target,
    ordersToday: todaySales.length,
    hourly,
    visitorsNow: new Set((recent as any[]).map((r) => r.session_id)).size,
    openTickets,
    newMessages,
    pendingOrders: orders.filter((o) => UNFULFILLED.includes(o.status)).length,
    byCoupon: top(coupons, 4),
    topPages: top(pageMap, 5),
  };
}

async function loadSettings(): Promise<DashboardSettings> {
  const { data } = await getSupabaseAdmin().from('settings').select('value').eq('key', SETTINGS_KEY).maybeSingle();
  return mergeDashboardSettings(data?.value);
}

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const settings = await loadSettings();
    const active = DASHBOARD_IDS.filter((id) => settings.enabled[id]);
    const key = JSON.stringify([active, settings.dailySalesTarget]);
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
      return NextResponse.json({ ...hit.payload, settings });
    }

    const now = new Date();
    const data: DashboardsResponse['data'] = {};
    const errors: DashboardsResponse['errors'] = {};

    if (active.length > 0) {
      // Everything needs at most "start of last month" of orders.
      const orders = await fetchOrders(istMonthStart(now, -1));
      const jobs: Record<DashboardId, () => Promise<any>> = {
        kpi: async () => buildKpi(orders, now),
        store: () => buildStore(orders, now),
        marketing: () => buildMarketing(orders, now),
        live: () => buildLive(orders, now, settings.dailySalesTarget),
      };
      await Promise.all(
        active.map(async (id) => {
          try {
            (data as any)[id] = await jobs[id]();
          } catch (e) {
            console.error(`[dashboards] ${id} failed:`, e);
            errors[id] = 'Is dashboard ka data load nahi ho paya.';
          }
        })
      );
    }

    const payload: DashboardsResponse = { settings, generatedAt: now.toISOString(), data, errors };
    if (Object.keys(errors).length === 0) cache.set(key, { at: Date.now(), payload });
    return NextResponse.json(payload);
  } catch (err) {
    console.error('[dashboards GET] error:', err);
    return NextResponse.json({ error: 'Failed to load dashboards' }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await req.json().catch(() => ({}));
    const merged = mergeDashboardSettings(body?.settings ?? body);
    const { error } = await getSupabaseAdmin().from('settings').upsert({ key: SETTINGS_KEY, value: merged }, { onConflict: 'key' });
    if (error) throw error;
    cache.clear();
    return NextResponse.json({ success: true, settings: merged });
  } catch (err) {
    console.error('[dashboards PUT] error:', err);
    return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 });
  }
}
