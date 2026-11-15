import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAdminToken, ADMIN_SESSION_COOKIE } from '@/lib/admin-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import {
  FEATURED_PLACEMENTS,
  FEATURED_SETTINGS_KEY,
  FeaturedPlacement,
  normalizeFlags,
} from '@/lib/featured-placements';

export const dynamic = 'force-dynamic';

async function requireAdmin() {
  const cookie = cookies().get(ADMIN_SESSION_COOKIE)?.value ?? null;
  const verified = await verifyAdminToken(cookie);
  return verified.valid;
}

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const { data, error } = await getSupabaseAdmin()
      .from('tracking_settings')
      .select('value')
      .eq('key', FEATURED_SETTINGS_KEY)
      .maybeSingle();
    if (error) return NextResponse.json({ flags: normalizeFlags(null), tableMissing: true });
    return NextResponse.json({ flags: normalizeFlags(data?.value), tableMissing: false });
  } catch {
    return NextResponse.json({ flags: normalizeFlags(null), tableMissing: true });
  }
}

// body: { placement: 'home' | 'shop' | 'category' | 'product', enabled: boolean }
export async function POST(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
  const placement = String(body?.placement ?? '') as FeaturedPlacement;
  if (!FEATURED_PLACEMENTS.includes(placement) || typeof body?.enabled !== 'boolean') {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from('tracking_settings')
    .select('value')
    .eq('key', FEATURED_SETTINGS_KEY)
    .maybeSingle();
  const next = { ...normalizeFlags(data?.value), [placement]: body.enabled };

  const { error } = await supabase
    .from('tracking_settings')
    .upsert({ key: FEATURED_SETTINGS_KEY, value: next, updated_at: new Date().toISOString() });
  if (error) {
    return NextResponse.json(
      { error: 'Save nahi hua. Pehle Supabase me 20261115020000_tracking_settings.sql run karo.' },
      { status: 500 }
    );
  }
  return NextResponse.json({ flags: next });
}
