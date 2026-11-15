import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAdminToken, ADMIN_SESSION_COOKIE } from '@/lib/admin-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

// Sirf ye event types band kiye ja sakte hain. cart/checkout/purchase kabhi band nahi hote.
const CONTROLLABLE = ['variant_switch', 'search', 'wishlist'];

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
      .eq('key', 'disabled_event_types')
      .maybeSingle();
    if (error) return NextResponse.json({ disabled: [], tableMissing: true });
    const disabled = Array.isArray(data?.value) ? (data!.value as string[]) : [];
    return NextResponse.json({ disabled, tableMissing: false });
  } catch {
    return NextResponse.json({ disabled: [], tableMissing: true });
  }
}

// body: { eventType: 'variant_switch', enabled: boolean }
export async function POST(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
  const eventType = String(body?.eventType ?? '');
  if (!CONTROLLABLE.includes(eventType) || typeof body?.enabled !== 'boolean') {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from('tracking_settings')
    .select('value')
    .eq('key', 'disabled_event_types')
    .maybeSingle();
  const current: string[] = Array.isArray(data?.value) ? (data!.value as string[]) : [];
  const next = body.enabled ? current.filter((t) => t !== eventType) : Array.from(new Set([...current, eventType]));

  const { error } = await supabase
    .from('tracking_settings')
    .upsert({ key: 'disabled_event_types', value: next, updated_at: new Date().toISOString() });
  if (error) {
    return NextResponse.json(
      { error: 'Save nahi hua. Pehle Supabase me 20261115020000_tracking_settings.sql run karo.' },
      { status: 500 }
    );
  }
  return NextResponse.json({ disabled: next });
}
