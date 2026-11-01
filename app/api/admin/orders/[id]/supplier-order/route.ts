import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAdminToken, ADMIN_SESSION_COOKIE } from '@/lib/admin-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { validateSupplierOrder } from '@/lib/supplier-order';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function guard(id: string) {
  const cookie = cookies().get(ADMIN_SESSION_COOKIE)?.value ?? null;
  const verified = await verifyAdminToken(cookie);
  if (!verified.valid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid order id' }, { status: 400 });
  return null;
}

function failMessage(err: any) {
  // Column missing = SQL migration not run yet.
  if (err?.code === '42703' || /supplier_order/.test(String(err?.message))) {
    return 'Pehle Supabase me SQL chalayein: ALTER TABLE orders ADD COLUMN IF NOT EXISTS supplier_order jsonb;';
  }
  return 'Save nahi ho paya';
}

// PUT -- mark an order as "ordered from supplier" (or edit it)
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const denied = await guard(params.id);
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  const parsed = validateSupplierOrder(body);
  if (typeof parsed === 'string') return NextResponse.json({ error: parsed }, { status: 400 });

  try {
    const { data, error } = await getSupabaseAdmin()
      .from('orders')
      .update({ supplier_order: parsed })
      .eq('id', params.id)
      .select('id')
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    return NextResponse.json({ success: true, supplier_order: parsed });
  } catch (err) {
    console.error('[supplier-order PUT]', err);
    return NextResponse.json({ error: failMessage(err) }, { status: 500 });
  }
}

// DELETE -- undo (order was not actually placed / wrong entry)
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const denied = await guard(params.id);
  if (denied) return denied;
  try {
    const { error } = await getSupabaseAdmin().from('orders').update({ supplier_order: null }).eq('id', params.id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[supplier-order DELETE]', err);
    return NextResponse.json({ error: failMessage(err) }, { status: 500 });
  }
}
