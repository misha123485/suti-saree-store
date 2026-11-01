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
  let query = db.from('products').select('id, name, price').order('name').limit(60);
  if (q) query = query.ilike('name', `%${q}%`);
  const { data: products, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const ids = (products || []).map((p) => String(p.id));
  const { data: costs } = ids.length ? await db.from('product_costs').select('product_id, cost_inr').in('product_id', ids) : { data: [] };
  const cm = new Map((costs || []).map((c) => [String(c.product_id), Number(c.cost_inr)]));
  return NextResponse.json({
    products: (products || []).map((p) => ({ id: String(p.id), name: p.name as string, price: Number(p.price) || 0, cost_inr: cm.get(String(p.id)) ?? null })),
  });
}

export async function PUT(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { costs?: Array<{ product_id?: string; cost_inr?: unknown }> } | null;
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
  return NextResponse.json({ ok: true, saved: upserts.length, removed: removes.length });
}
