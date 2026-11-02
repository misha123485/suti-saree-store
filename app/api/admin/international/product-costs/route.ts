import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/intl-server';

// Admin-only product COST prices (table product_costs: RLS on, no policies, service role only).
// GET ?q=saree  -> up to 60 products (id, name, price) with their saved cost
// PUT { costs: [{ product_id, cost_inr }] }  (cost_inr null/'' removes the saved cost)
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const q = (new URL(req.url).searchParams.get('q') || '').replace(/[%,()*]/g, ' ').trim().slice(0, 60);
  const db = getSupabaseAdmin();
  const build = (cols: string) => {
    let query = db.from('products').select(cols).order('name').limit(60);
    if (q) query = query.ilike('name', `%${q}%`);
    return query;
  };
  let res = await build('id, name, price, export_blocked');
  if (res.error && /export_blocked/.test(res.error.message)) res = await build('id, name, price'); // migration not applied yet
  if (res.error) return NextResponse.json({ error: res.error.message }, { status: 500 });
  const products = (res.data || []) as unknown as Array<{ id: string; name: string; price: number; export_blocked?: boolean }>;
  const ids = (products || []).map((p) => String(p.id));
  const { data: costs } = ids.length ? await db.from('product_costs').select('product_id, cost_inr').in('product_id', ids) : { data: [] };
  const cm = new Map((costs || []).map((c) => [String(c.product_id), Number(c.cost_inr)]));
  return NextResponse.json({
    products: (products || []).map((p) => ({ id: String(p.id), name: p.name as string, price: Number(p.price) || 0, cost_inr: cm.get(String(p.id)) ?? null, export_blocked: p.export_blocked === true })),
  });
}

export async function PUT(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { costs?: Array<{ product_id?: string; cost_inr?: unknown }>; blocked?: Array<{ product_id?: string; export_blocked?: unknown }> } | null;
  const blockedList = Array.isArray(body?.blocked) ? body!.blocked! : [];
  if (blockedList.length > 200) return NextResponse.json({ error: 'max 200 per call' }, { status: 400 });
  if (blockedList.length) {
    const db0 = getSupabaseAdmin();
    for (const flag of [true, false]) {
      const ids = blockedList.filter((b) => typeof b?.product_id === 'string' && (b.export_blocked === true) === flag).map((b) => b.product_id as string);
      if (!ids.length) continue;
      const { error } = await db0.from('products').update({ export_blocked: flag }).in('id', ids);
      if (error) return NextResponse.json({ error: /export_blocked/.test(error.message) ? 'Run migration 20261106000000_products_export_blocked.sql first' : error.message }, { status: 500 });
    }
    if (!Array.isArray(body?.costs) || body!.costs!.length === 0) return NextResponse.json({ ok: true, saved: 0, removed: 0, blocked: blockedList.length });
  }
  if (!body || !Array.isArray(body.costs) || body.costs.length === 0 || body.costs.length > 200) return NextResponse.json({ error: 'costs[] required (max 200)' }, { status: 400 });
  const upserts: Array<{ product_id: string; cost_inr: number; updated_at: string }> = [];
  const removes: string[] = [];
  for (const c of body.costs) {
    if (!c?.product_id || typeof c.product_id !== 'string') return NextResponse.json({ error: 'product_id required' }, { status: 400 });
    if (c.cost_inr === null || c.cost_inr === '' || c.cost_inr === undefined) { removes.push(c.product_id); continue; }
    const n = Math.round(Number(c.cost_inr) * 100) / 100;
    if (!Number.isFinite(n) || n < 0 || n > 10000000) return NextResponse.json({ error: `Invalid cost for ${c.product_id}` }, { status: 400 });
    upserts.push({ product_id: c.product_id, cost_inr: n, updated_at: new Date().toISOString() });
  }
  const db = getSupabaseAdmin();
  if (upserts.length) {
    const { error } = await db.from('product_costs').upsert(upserts, { onConflict: 'product_id' });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (removes.length) {
    const { error } = await db.from('product_costs').delete().in('product_id', removes);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, saved: upserts.length, removed: removes.length, blocked: blockedList.length });
}
