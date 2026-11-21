import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAdminToken, ADMIN_SESSION_COOKIE } from '@/lib/admin-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

async function requireAdmin() {
  const cookie = cookies().get(ADMIN_SESSION_COOKIE)?.value ?? null;
  return (await verifyAdminToken(cookie)).valid;
}
const unauthorized = () => NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

// GET -- every store review (pending first)
export async function GET() {
  if (!(await requireAdmin())) return unauthorized();
  try {
    const { data, error } = await getSupabaseAdmin()
      .from('store_reviews')
      .select('*')
      .order('is_approved', { ascending: true })
      .order('created_at', { ascending: false })
      .limit(500);
    if (error) throw error;
    return NextResponse.json({ reviews: data ?? [] });
  } catch (err) {
    console.error('[admin/store-reviews GET] error:', err);
    return NextResponse.json({ error: 'Failed to load store reviews' }, { status: 500 });
  }
}

// PATCH { id, is_approved } -- publish / hide
export async function PATCH(req: Request) {
  if (!(await requireAdmin())) return unauthorized();
  try {
    const body = await req.json().catch(() => ({}));
    if (typeof body?.id !== 'string' || typeof body?.is_approved !== 'boolean') {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }
    const { error } = await getSupabaseAdmin().from('store_reviews').update({ is_approved: body.is_approved }).eq('id', body.id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[admin/store-reviews PATCH] error:', err);
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
  }
}

// DELETE ?id=...
export async function DELETE(req: Request) {
  if (!(await requireAdmin())) return unauthorized();
  try {
    const id = new URL(req.url).searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    const { error } = await getSupabaseAdmin().from('store_reviews').delete().eq('id', id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[admin/store-reviews DELETE] error:', err);
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 });
  }
}
