import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { verifyAdminToken, ADMIN_SESSION_COOKIE } from '@/lib/admin-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { HOME_APP_LAYOUT_KEY, normalizeHomeAppLayout } from '@/lib/home-app-layout';

async function requireAdmin() {
  const cookie = cookies().get(ADMIN_SESSION_COOKIE)?.value ?? null;
  const verified = await verifyAdminToken(cookie);
  return verified.valid;
}

export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { data } = await getSupabaseAdmin()
    .from('settings')
    .select('value')
    .eq('key', HOME_APP_LAYOUT_KEY)
    .maybeSingle();
  return NextResponse.json({ settings: normalizeHomeAppLayout(data?.value) });
}

export async function PUT(req: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const settings = normalizeHomeAppLayout(body?.settings);
  const { error } = await getSupabaseAdmin()
    .from('settings')
    .upsert({ key: HOME_APP_LAYOUT_KEY, value: settings }, { onConflict: 'key' });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  revalidatePath('/');
  return NextResponse.json({ settings });
}
