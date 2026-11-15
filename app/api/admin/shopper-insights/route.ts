import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAdminToken, ADMIN_SESSION_COOKIE } from '@/lib/admin-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { fetchCapped } from '@/lib/fetch-capped';

export const dynamic = 'force-dynamic';

/**
 * Admin > Analytics > Shopper Insights.
 *
 * Reads ONLY the activity_events table (add_to_cart, checkout_start, purchase
 * + a narrow product_view read) for the chosen date range and aggregates in
 * memory. No new tables, no extra services -> fits Supabase / Vercel free tier.
 *
 * Free-tier guards: max 90 days range, max ~30k + 20k rows read per request,
 * 60s in-memory cache per range (so pressing Refresh repeatedly is free).
 */

const MAX_RANGE_DAYS = 90;
const PAGE = 1000; // Supabase returns max 1000 rows per request
const MAX_PAGES_MAIN = 30;
const MAX_PAGES_VIEWS = 20;
const CACHE_MS = 60_000;
const IST_MS = 5.5 * 60 * 60 * 1000;

const BASE_COLS = 'session_id, user_id, event_type, product_id, metadata, created_at';
const NEW_COLS = ', visitor_id, country, region, city, device, source';

const INDIA_STATES: Record<string, string> = {
  AN: 'Andaman & Nicobar', AP: 'Andhra Pradesh', AR: 'Arunachal Pradesh', AS: 'Assam', BR: 'Bihar',
  CH: 'Chandigarh', CT: 'Chhattisgarh', DD: 'Daman & Diu', DL: 'Delhi', DN: 'Dadra & Nagar Haveli',
  GA: 'Goa', GJ: 'Gujarat', HP: 'Himachal Pradesh', HR: 'Haryana', JH: 'Jharkhand',
  JK: 'Jammu & Kashmir', KA: 'Karnataka', KL: 'Kerala', LA: 'Ladakh', LD: 'Lakshadweep',
  MH: 'Maharashtra', ML: 'Meghalaya', MN: 'Manipur', MP: 'Madhya Pradesh', MZ: 'Mizoram',
  NL: 'Nagaland', OR: 'Odisha', OD: 'Odisha', PB: 'Punjab', PY: 'Puducherry', RJ: 'Rajasthan',
  SK: 'Sikkim', TG: 'Telangana', TN: 'Tamil Nadu', TR: 'Tripura', UP: 'Uttar Pradesh',
  UT: 'Uttarakhand', UK: 'Uttarakhand', WB: 'West Bengal',
};

type Ev = {
  session_id: string;
  user_id: string | null;
  event_type: string;
  product_id: string | null;
  metadata: any;
  created_at: string;
  visitor_id?: string | null;
  country?: string | null;
  region?: string | null;
  city?: string | null;
  device?: string | null;
  source?: string | null;
};

type V = {
  key: string;
  sessions: Set<string>;
  days: Set<string>;
  viewed: boolean;
  atcEvents: number;
  checkoutSessions: Set<string>;
  purchased: boolean;
  orders: number;
  revenue: number;
  cartValue: number;
  email: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  device: string | null;
  source: string | null;
  firstSeen: string;
  lastSeen: string;
  products: Map<string, number>;
};

const cache = new Map<string, { at: number; body: any }>();

function chunk<T>(a: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n));
  return out;
}

// Visitor/event totals for the "pichle period se compare" arrows.
function summarize(rows: Ev[]) {
  const key = (e: Ev) => e.visitor_id || e.user_id || e.session_id;
  const atc = new Set<string>(), co = new Set<string>(), buy = new Set<string>();
  let atcEvents = 0, revenue = 0;
  for (const e of rows) {
    if (e.event_type === 'add_to_cart') { atc.add(key(e)); atcEvents += 1; }
    else if (e.event_type === 'checkout_start') co.add(key(e));
    else if (e.event_type === 'purchase') { buy.add(key(e)); revenue += Number(e.metadata?.total) || 0; }
  }
  return { atcEvents, atcVisitors: atc.size, checkoutVisitors: co.size, purchaseVisitors: buy.size, revenue: Math.round(revenue) };
}

const istDay = (iso: string) => new Date(new Date(iso).getTime() + IST_MS).toISOString().slice(0, 10);
const istHour = (iso: string) => new Date(new Date(iso).getTime() + IST_MS).getUTCHours();

async function fetchAll(
  build: (cols: string) => (a: number, b: number) => PromiseLike<{ data: any[] | null; error: any }>,
  colsFull: string,
  colsBase: string,
  maxPages: number
) {
  let cols = colsFull;
  let needsMigration = false;
  const rows: Ev[] = [];
  let truncated = false;
  for (let page = 0; page < maxPages; page++) {
    let { data, error } = await build(cols)(page * PAGE, page * PAGE + PAGE - 1);
    if (error && cols === colsFull && page === 0) {
      // columns from the migration don't exist yet -> retry with the old ones
      cols = colsBase;
      needsMigration = true;
      ({ data, error } = await build(cols)(0, PAGE - 1));
    }
    if (error) throw error;
    rows.push(...((data ?? []) as Ev[]));
    if (!data || data.length < PAGE) break;
    if (page === maxPages - 1) truncated = true;
  }
  return { rows, truncated, needsMigration };
}

export async function GET(req: Request) {
  const cookie = cookies().get(ADMIN_SESSION_COOKIE)?.value ?? null;
  const verified = await verifyAdminToken(cookie);
  if (!verified.valid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  let to = new Date(url.searchParams.get('to') ?? Date.now());
  let from = new Date(url.searchParams.get('from') ?? Date.now() - 30 * 86400_000);
  if (isNaN(to.getTime())) to = new Date();
  if (isNaN(from.getTime())) from = new Date(to.getTime() - 30 * 86400_000);
  if (from > to) [from, to] = [to, from];
  const minFrom = new Date(to.getTime() - MAX_RANGE_DAYS * 86400_000);
  if (from < minFrom) from = minFrom;

  const cacheKey = `${Math.floor(from.getTime() / 60000)}-${Math.floor(to.getTime() / 60000)}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_MS) return NextResponse.json(hit.body);

  try {
    const sb = getSupabaseAdmin();
    const f = from.toISOString();
    const t = to.toISOString();

    const main = await fetchAll(
      (cols) => (a, b) =>
        sb.from('activity_events').select(cols)
          .in('event_type', ['add_to_cart', 'checkout_start', 'purchase'])
          .gte('created_at', f).lte('created_at', t)
          .order('created_at', { ascending: true }).range(a, b),
      BASE_COLS + NEW_COLS,
      BASE_COLS,
      MAX_PAGES_MAIN
    );
    const views = await fetchAll(
      (cols) => (a, b) =>
        sb.from('activity_events').select(cols)
          .eq('event_type', 'product_view')
          .gte('created_at', f).lte('created_at', t)
          .order('created_at', { ascending: true }).range(a, b),
      'session_id, user_id, event_type, product_id, created_at, visitor_id, country, region, city, device, source',
      'session_id, user_id, event_type, product_id, created_at',
      MAX_PAGES_VIEWS
    );

    const events = [...main.rows, ...views.rows].sort((x, y) => x.created_at.localeCompare(y.created_at));
    const needsMigration = main.needsMigration || views.needsMigration;
    const truncated = main.truncated || views.truncated;

    // ── group by visitor ────────────────────────────────────────────────
    const visitors = new Map<string, V>();
    type P = {
      views: Set<string>; atcEvents: number; atcQty: number;
      atcV: Set<string>; coV: Set<string>; colors: Map<string, number>;
    };
    const products = new Map<string, P>();
    const getP = (id: string): P => {
      let p = products.get(id);
      if (!p) { p = { views: new Set(), atcEvents: 0, atcQty: 0, atcV: new Set(), coV: new Set(), colors: new Map() }; products.set(id, p); }
      return p;
    };
    const sessionsViewed = new Set<string>();
    const sessionsAtc = new Set<string>();
    const sessionsCo = new Set<string>();
    const sessionsBuy = new Set<string>();
    const sessionCartValue = new Map<string, number>();
    const hourly = Array.from({ length: 24 }, (_, hour) => ({ hour, atc: 0, checkout: 0 }));
    const coSeenHour = new Set<string>();
    const daily = new Map<string, { atc: number; checkout: number; purchase: number }>();
    const dayRow = (d: string) => { let r = daily.get(d); if (!r) { r = { atc: 0, checkout: 0, purchase: 0 }; daily.set(d, r); } return r; };
    let atcEventsTotal = 0, atcQtyTotal = 0, ordersTotal = 0, revenueTotal = 0;
    const productNames = new Set<string>();

    for (const e of events) {
      const key = e.visitor_id || e.user_id || e.session_id;
      let v = visitors.get(key);
      if (!v) {
        v = {
          key, sessions: new Set(), days: new Set(), viewed: false, atcEvents: 0,
          checkoutSessions: new Set(), purchased: false, orders: 0, revenue: 0, cartValue: 0,
          email: null, country: null, region: null, city: null, device: null, source: null,
          firstSeen: e.created_at, lastSeen: e.created_at, products: new Map(),
        };
        visitors.set(key, v);
      }
      v.sessions.add(e.session_id);
      v.days.add(istDay(e.created_at));
      v.lastSeen = e.created_at;
      if (e.country) { v.country = e.country; v.region = e.region ?? v.region; v.city = e.city ?? v.city; }
      if (e.device) v.device = e.device;
      if (e.source && !v.source) v.source = e.source;
      const md = e.metadata ?? {};
      const day = istDay(e.created_at);

      if (e.event_type === 'product_view') {
        v.viewed = true;
        sessionsViewed.add(e.session_id);
        if (e.product_id) getP(e.product_id).views.add(e.session_id);
      } else if (e.event_type === 'add_to_cart') {
        const qty = Math.max(1, Number(md.quantity) || 1);
        v.atcEvents += 1;
        atcEventsTotal += 1; atcQtyTotal += qty;
        sessionsAtc.add(e.session_id);
        dayRow(day).atc += 1;
        hourly[istHour(e.created_at)].atc += 1;
        if (e.product_id) {
          const p = getP(e.product_id);
          p.atcEvents += 1; p.atcQty += qty; p.atcV.add(key);
          const color = typeof md.color === 'string' && md.color ? md.color : null;
          if (color) p.colors.set(color, (p.colors.get(color) ?? 0) + 1);
          v.products.set(e.product_id, (v.products.get(e.product_id) ?? 0) + 1);
          productNames.add(e.product_id);
        }
      } else if (e.event_type === 'checkout_start') {
        sessionsCo.add(e.session_id);
        if (!v.checkoutSessions.has(e.session_id)) {
          v.checkoutSessions.add(e.session_id);
          dayRow(day).checkout += 1;
        }
        const hk = `${e.session_id}-${istHour(e.created_at)}`;
        if (!coSeenHour.has(hk)) { coSeenHour.add(hk); hourly[istHour(e.created_at)].checkout += 1; }
        const cv = Number(md.cartValue) || 0;
        if (cv > v.cartValue) v.cartValue = cv;
        if (cv > (sessionCartValue.get(e.session_id) ?? 0)) sessionCartValue.set(e.session_id, cv);
        if (e.product_id) {
          getP(e.product_id).coV.add(key);
          v.products.set(e.product_id, v.products.get(e.product_id) ?? 0);
          productNames.add(e.product_id);
        }
      } else if (e.event_type === 'purchase') {
        v.purchased = true; v.orders += 1;
        ordersTotal += 1;
        const total = Number(md.total) || 0;
        v.revenue += total; revenueTotal += total;
        sessionsBuy.add(e.session_id);
        dayRow(day).purchase += 1;
        if (typeof md.email === 'string' && md.email) v.email = md.email;
      }
    }

    // ── real orders in range: product-wise orders/revenue + pincode ────────
    const orderRows: any[] = [];
    for (let page = 0; page < 3; page++) {
      const { data, error } = await sb.from('orders')
        .select('id, status, total_amount, shipping_address')
        .gte('created_at', f).lte('created_at', t)
        .order('created_at', { ascending: true })
        .range(page * PAGE, page * PAGE + PAGE - 1);
      if (error) break;
      orderRows.push(...(data ?? []));
      if (!data || data.length < PAGE) break;
    }
    const isCancelled = (st: any) => /cancel/i.test(String(st ?? ''));
    const isProblem = (st: any) => /cancel|return|rto|fail/i.test(String(st ?? ''));
    const goodOrderIds = new Set(orderRows.filter((o) => !isCancelled(o.status)).map((o) => o.id));

    const orderAgg = new Map<string, { orders: Set<string>; units: number; revenue: number }>();
    for (const ids of chunk(orderRows.map((o) => o.id as string), 100)) {
      const { data } = await sb.from('order_items').select('order_id, product_id, quantity, price').in('order_id', ids);
      for (const it of data ?? []) {
        if (!it.product_id || !goodOrderIds.has(it.order_id)) continue;
        let a = orderAgg.get(it.product_id);
        if (!a) { a = { orders: new Set(), units: 0, revenue: 0 }; orderAgg.set(it.product_id, a); }
        a.orders.add(it.order_id);
        a.units += Number(it.quantity) || 0;
        a.revenue += (Number(it.quantity) || 0) * (Number(it.price) || 0);
      }
    }
    for (const id of Array.from(orderAgg.keys())) getP(id);

    const pinMap = new Map<string, { pincode: string; place: string; orders: number; revenue: number; problems: number }>();
    for (const o of orderRows) {
      const a = o.shipping_address ?? {};
      const pin = String(a.pincode ?? a.pin_code ?? a.zip ?? a.postal_code ?? '').trim();
      if (!pin) continue;
      let r = pinMap.get(pin);
      if (!r) { r = { pincode: pin, place: [a.city, a.state].filter(Boolean).join(', '), orders: 0, revenue: 0, problems: 0 }; pinMap.set(pin, r); }
      r.orders += 1;
      if (!isCancelled(o.status)) r.revenue += Number(o.total_amount) || 0;
      if (isProblem(o.status)) r.problems += 1;
    }
    const pincodes = Array.from(pinMap.values()).sort((a, b) => b.orders - a.orders).slice(0, 40);

    // ── cart value bands (checkout sessions) ───────────────────────────
    const bands = [
      { name: 'Under ₹500', min: 0, max: 500 }, { name: '₹500-1,000', min: 500, max: 1000 },
      { name: '₹1,000-2,000', min: 1000, max: 2000 }, { name: '₹2,000-5,000', min: 2000, max: 5000 },
      { name: '₹5,000+', min: 5000, max: Infinity },
    ].map((b) => ({ name: b.name, checkouts: 0, purchased: 0, min: b.min, max: b.max }));
    for (const [sid, cv] of Array.from(sessionCartValue.entries())) {
      const b = bands.find((x) => cv >= x.min && cv < x.max);
      if (!b) continue;
      b.checkouts += 1;
      if (sessionsBuy.has(sid)) b.purchased += 1;
    }

    // ── pichla period (same length) for comparison arrows ──────────────
    const span = to.getTime() - from.getTime();
    const prevFrom = new Date(from.getTime() - span).toISOString();
    let prev: ReturnType<typeof summarize> | null = null;
    try {
      const pr = await fetchAll(
        (cols) => (a, b) =>
          sb.from('activity_events').select(cols)
            .in('event_type', ['add_to_cart', 'checkout_start', 'purchase'])
            .gte('created_at', prevFrom).lt('created_at', f)
            .order('created_at', { ascending: true }).range(a, b),
        'session_id, user_id, event_type, metadata, visitor_id',
        'session_id, user_id, event_type, metadata',
        10
      );
      prev = summarize(pr.rows);
    } catch { prev = null; }

    // ── abandoned carts that have a phone number (free wa.me link) ─────
    let abandonedCarts: any[] = [];
    try {
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.sutisaree.com';
      const { data } = await sb.from('abandoned_carts')
        .select('id, email, phone, items, cart_value, last_activity_at')
        .eq('recovered', false).not('phone', 'is', null)
        .gte('last_activity_at', f).lte('last_activity_at', t)
        .order('last_activity_at', { ascending: false }).limit(50);
      abandonedCarts = (data ?? []).map((c: any) => {
        let digits = String(c.phone ?? '').replace(/\D/g, '');
        if (digits.startsWith('91') && digits.length === 12) digits = digits.slice(2);
        if (digits.startsWith('0') && digits.length === 11) digits = digits.slice(1);
        const valid = /^[6-9][0-9]{9}$/.test(digits);
        const names = (Array.isArray(c.items) ? c.items : []).slice(0, 3).map((it: any) => it?.product_name || it?.name || 'Item');
        const msg = `Hello, this is Sutisaree. We noticed you left ${names.length > 1 ? 'some items' : 'an item'} in your cart${c.cart_value ? ` (Rs ${c.cart_value})` : ''}. You can complete your order here: ${siteUrl}/cart-link/${c.id}`;
        return {
          id: c.id, email: c.email ?? null, phone: valid ? digits : null,
          cartValue: Number(c.cart_value) || 0, items: names, lastActivity: c.last_activity_at,
          waUrl: valid ? `https://wa.me/91${digits}?text=${encodeURIComponent(msg)}` : null,
        };
      });
    } catch { abandonedCarts = []; }

    // product names for the products that actually show up in cart/checkout
    // (+ top viewed ones) -- one query, capped.
    const ranked = Array.from(products.entries())
      .sort((a, b) =>
        (b[1].atcEvents + b[1].coV.size + (orderAgg.get(b[0])?.orders.size ?? 0)) - (a[1].atcEvents + a[1].coV.size + (orderAgg.get(a[0])?.orders.size ?? 0)) ||
        b[1].views.size - a[1].views.size)
      .slice(0, 100);
    const ids = ranked.map(([id]) => id);
    const { data: prows } = ids.length
      ? await sb.from('products').select('id, name, slug, images').in('id', ids)
      : { data: [] as { id: string; name: string; slug: string; images: string[] | null }[] };
    const pmap = new Map((prows ?? []).map((p: any) => [p.id, p]));

    const productRows = ranked.map(([id, p]) => ({
      productId: id,
      name: pmap.get(id)?.name ?? 'Unknown product',
      slug: pmap.get(id)?.slug ?? null,
      image: (pmap.get(id) as any)?.images?.[0] ?? null,
      orders: orderAgg.get(id)?.orders.size ?? 0,
      units: orderAgg.get(id)?.units ?? 0,
      revenue: Math.round(orderAgg.get(id)?.revenue ?? 0),
      views: p.views.size,
      atcEvents: p.atcEvents,
      atcQty: p.atcQty,
      atcVisitors: p.atcV.size,
      checkoutVisitors: p.coV.size,
      colors: Array.from(p.colors.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 5),
    }));

    // ── location / device / source breakdowns ──────────────────────────
    const stateName = (v: V) => {
      if (!v.country) return 'Unknown';
      if (v.country === 'IN' && v.region) return INDIA_STATES[v.region.toUpperCase()] ?? v.region;
      return v.region || 'Unknown';
    };
    const group = (label: (v: V) => string) => {
      const m = new Map<string, { name: string; visitors: number; carted: number; checkout: number; purchased: number; atcEvents: number; revenue: number }>();
      for (const v of Array.from(visitors.values())) {
        const name = label(v);
        let r = m.get(name);
        if (!r) { r = { name, visitors: 0, carted: 0, checkout: 0, purchased: 0, atcEvents: 0, revenue: 0 }; m.set(name, r); }
        r.visitors += 1;
        if (v.atcEvents > 0) r.carted += 1;
        if (v.checkoutSessions.size > 0) r.checkout += 1;
        if (v.purchased) r.purchased += 1;
        r.atcEvents += v.atcEvents;
        r.revenue += Math.round(v.revenue);
      }
      return Array.from(m.values())
        .sort((a, b) => b.checkout - a.checkout || b.carted - a.carted || b.visitors - a.visitors)
        .slice(0, 60);
    };

    // ── repeat visitors ────────────────────────────────────────────────
    const all = Array.from(visitors.values());
    const carters = all.filter((v) => v.atcEvents > 0);
    const repeatVisitors = all.filter((v) => v.sessions.size >= 2).length;
    const repeatNotBought = all.filter((v) => v.sessions.size >= 2 && (v.atcEvents > 0 || v.checkoutSessions.size > 0) && !v.purchased).length;
    const abandoned = all.filter((v) => v.checkoutSessions.size > 0 && !v.purchased);

    const visitorRows = all
      .filter((v) => v.atcEvents > 0 || v.checkoutSessions.size > 0 || v.purchased)
      .sort((a, b) =>
        Number(b.checkoutSessions.size > 0 && !b.purchased) - Number(a.checkoutSessions.size > 0 && !a.purchased) ||
        b.sessions.size - a.sessions.size || b.atcEvents - a.atcEvents)
      .slice(0, 150)
      .map((v) => ({
        id: v.key.slice(0, 8),
        label: v.email ?? `Guest #${v.key.slice(0, 4)}`,
        visits: v.sessions.size,
        days: v.days.size,
        atcEvents: v.atcEvents,
        checkoutStarted: v.checkoutSessions.size > 0,
        purchased: v.purchased,
        cartValue: Math.round(v.cartValue),
        revenue: Math.round(v.revenue),
        city: v.city || 'Unknown',
        state: stateName(v),
        country: v.country || 'Unknown',
        device: v.device || 'Unknown',
        source: v.source || 'Unknown',
        firstSeen: v.firstSeen,
        lastSeen: v.lastSeen,
        products: Array.from(v.products.keys()).slice(0, 4).map((id) => pmap.get(id)?.name ?? 'Product'),
      }));

    const dailyRows = Array.from(daily.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([day, r]) => ({ day, ...r }));

    // ── Trending strip se kya mila (metadata.via_featured, lib/track-api.ts) ──
    // Click = strip se khule product ka pehla product_view. Order = purchase jo us session me hua
    // jisne strip se kuch click kiya (touch-attribution; ek session kai jagah touch kare to dono me ginta hai).
    const FEATURED_LABELS: Record<string, string> = {
      home: 'Home page (top)',
      shop: 'Shop page',
      category: 'Category page',
      product: 'Product page',
      similar: 'Similar products (mix)',
    };
    let featuredRows: {
      placement: string; label: string; clicks: number; cartSessions: number;
      checkoutSessions: number; orders: number; revenue: number;
    }[] = [];
    try {
      const frows = await fetchCapped<any>(
        (a, b) =>
          sb.from('activity_events')
            .select('session_id, event_type, metadata')
            .in('event_type', ['product_view', 'add_to_cart', 'checkout_start'])
            .not('metadata->>via_featured', 'is', null)
            .gte('created_at', f).lte('created_at', t)
            .order('created_at', { ascending: true }).range(a, b),
        10000
      );
      type FA = { clicks: number; sessions: Set<string>; cart: Set<string>; co: Set<string> };
      const fa = new Map<string, FA>();
      for (const r of frows) {
        const p = String(r.metadata?.via_featured ?? '');
        if (!p) continue;
        let x = fa.get(p);
        if (!x) fa.set(p, (x = { clicks: 0, sessions: new Set(), cart: new Set(), co: new Set() }));
        x.sessions.add(r.session_id);
        if (r.event_type === 'product_view') x.clicks++;
        else if (r.event_type === 'add_to_cart') x.cart.add(r.session_id);
        else if (r.event_type === 'checkout_start') x.co.add(r.session_id);
      }
      const seenOrders = new Set<string>();
      featuredRows = Array.from(fa.entries()).map(([p, x]) => {
        let orders = 0, revenue = 0;
        for (const e of main.rows) {
          if (e.event_type !== 'purchase' || !x.sessions.has(e.session_id)) continue;
          const k = `${p}|${e.session_id}|${e.created_at}`;
          if (seenOrders.has(k)) continue;
          seenOrders.add(k);
          orders++;
          revenue += Number(e.metadata?.total) || 0;
        }
        return {
          placement: p, label: FEATURED_LABELS[p] ?? p, clicks: x.clicks,
          cartSessions: x.cart.size, checkoutSessions: x.co.size, orders, revenue: Math.round(revenue),
        };
      }).sort((a, b) => b.orders - a.orders || b.cartSessions - a.cartSessions || b.clicks - a.clicks);
    } catch (e) {
      console.error('[admin/shopper-insights] featured stats failed', e);
    }

    const body = {
      range: { from: f, to: t },
      generatedAt: new Date().toISOString(),
      truncated,
      needsMigration,
      hasGeoData: all.some((v) => !!v.country),
      totals: {
        atcEvents: atcEventsTotal,
        atcQty: atcQtyTotal,
        atcVisitors: carters.length,
        checkoutVisitors: all.filter((v) => v.checkoutSessions.size > 0).length,
        purchaseVisitors: all.filter((v) => v.purchased).length,
        orders: ordersTotal,
        revenue: Math.round(revenueTotal),
        abandonedVisitors: abandoned.length,
        abandonedValue: Math.round(abandoned.reduce((s, v) => s + v.cartValue, 0)),
        productViewVisitors: all.filter((v) => v.viewed).length,
      },
      funnel: [
        { name: 'Product dekha', value: sessionsViewed.size },
        { name: 'Add to cart', value: sessionsAtc.size },
        { name: 'Begin checkout', value: sessionsCo.size },
        { name: 'Order kiya', value: sessionsBuy.size },
      ],
      products: productRows,
      locations: { state: group(stateName), city: group((v) => v.city || 'Unknown'), country: group((v) => v.country || 'Unknown') },
      repeat: {
        newVisitors: all.length - repeatVisitors,
        repeatVisitors,
        repeatRate: all.length ? Math.round((repeatVisitors / all.length) * 1000) / 10 : 0,
        repeatNotBought,
        avgVisitsOfCarters: carters.length
          ? Math.round((carters.reduce((s, v) => s + v.sessions.size, 0) / carters.length) * 10) / 10
          : 0,
      },
      visitors: visitorRows,
      hourly,
      daily: dailyRows,
      prev,
      cartBands: bands.map(({ name, checkouts, purchased }) => ({ name, checkouts, purchased })),
      pincodes,
      abandonedCarts,
      featured: featuredRows,
      devices: group((v) => v.device || 'Unknown'),
      sources: group((v) => v.source || 'Unknown'),
    };

    cache.set(cacheKey, { at: Date.now(), body });
    if (cache.size > 20) cache.delete(cache.keys().next().value as string);
    return NextResponse.json(body);
  } catch (err) {
    console.error('[admin/shopper-insights] failed:', err);
    return NextResponse.json({ error: 'Failed to load shopper insights' }, { status: 500 });
  }
}
