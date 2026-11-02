import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

// Public. Checkout asks "can these cart products be shipped abroad?" BEFORE creating an international order.
// Returns only the names of blocked products among the ids sent. Authoritative enforcement is still
// server-side in /api/stripe/create-session (no payment can start for an order containing a blocked product).
export const dynamic = 'force-dynamic';

const hits = new Map<string, number[]>();
function limited(ip: string): boolean {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < 60_000);
  arr.push(now);
  hits.set(ip, arr);
  if (hits.size > 5000) hits.clear();
  return arr.length > 30;
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-nf-client-connection-ip') || req.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
  if (limited(ip)) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  const body = (await req.json().catch(() => null)) as { productIds?: unknown } | null;
  const ids = Array.isArray(body?.productIds) ? (body!.productIds as unknown[]).filter((x): x is string => typeof x === 'string').slice(0, 100) : [];
  if (!ids.length) return NextResponse.json({ blocked: [] });
  const { data, error } = await getSupabaseAdmin().from('products').select('id, name').in('id', ids).eq('export_blocked', true);
  if (error) return NextResponse.json({ blocked: [] }); // column not migrated yet => nothing blocked (create-session also fails open the same way)
  return NextResponse.json({ blocked: (data || []).map((p) => ({ id: String(p.id), name: String(p.name) })) });
}
