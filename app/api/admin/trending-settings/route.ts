import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAdminToken, ADMIN_SESSION_COOKIE } from '@/lib/admin-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import {
  TRENDING_CONFIG_KEY,
  TRENDING_SIGNALS,
  TrendingSignal,
  normalizeTrendingConfig,
} from '@/lib/trending-config';

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
      .eq('key', TRENDING_CONFIG_KEY)
      .maybeSingle();
    if (error) return NextResponse.json({ config: normalizeTrendingConfig(null), tableMissing: true });
    return NextResponse.json({ config: normalizeTrendingConfig(data?.value), tableMissing: false });
  } catch {
    return NextResponse.json({ config: normalizeTrendingConfig(null), tableMissing: true });
  }
}

// body: { signal: 'purchase'|'checkout'|'cart'|'view', enabled: boolean }  YA  { since: 'YYYY-MM-DD' | null }
export async function POST(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data } = await supabase.from('tracking_settings').select('value').eq('key', TRENDING_CONFIG_KEY).maybeSingle();
  const current = normalizeTrendingConfig(data?.value);
  let next = current;

  if ('signal' in (body ?? {})) {
    const signal = String(body.signal) as TrendingSignal;
    if (!TRENDING_SIGNALS.includes(signal) || typeof body.enabled !== 'boolean') {
      return NextResponse.json({ error: 'Bad request' }, { status: 400 });
    }
    next = { ...current, [signal]: body.enabled };
  } else if ('since' in (body ?? {})) {
    if (body.since !== null && typeof body.since !== 'string') {
      return NextResponse.json({ error: 'Bad request' }, { status: 400 });
    }
    const candidate = normalizeTrendingConfig({ ...current, since: body.since });
    if (body.since && !candidate.since) {
      return NextResponse.json({ error: 'Date galat hai' }, { status: 400 });
    }
    next = candidate;
  } else {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }

  const { error } = await supabase
    .from('tracking_settings')
    .upsert({ key: TRENDING_CONFIG_KEY, value: next, updated_at: new Date().toISOString() });
  if (error) {
    return NextResponse.json(
      { error: 'Save nahi hua. Pehle Supabase me 20261115020000_tracking_settings.sql run karo.' },
      { status: 500 }
    );
  }
  return NextResponse.json({ config: next });
}
