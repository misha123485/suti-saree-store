import 'server-only';
import { getSupabaseAdmin } from './supabase-admin';

// CUSTOMER-FACING, READ-ONLY view of the imported old-site (WooCommerce)
// orders.
//
// The legacy_wc_* tables are RLS-locked to service_role, so this uses the
// service-role client. That is only safe because EVERY function here is
// scoped to one email address, and callers must pass the email of the
// currently logged-in user AFTER checking that the email is verified
// (see app/account/orders/page.tsx and app/account/orders/old/[id]/page.tsx).
//
// Never expose a function here that takes a free-form email from the
// browser. Never select ip_address / user_agent.

export type MyLegacyOrder = {
  id: number;
  status: string;
  total_amount: number;
  date_created_gmt: string | null;
  item_count: number;
  first_item: string | null;
};

// Statuses that are not real customer orders.
const HIDDEN_STATUSES = new Set(['trash', 'auto-draft', 'checkout-draft', 'draft']);
const cleanStatus = (s: string) => (s ?? '').replace(/^wc-/, '');

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : 0;
};

// ILIKE treats % and _ as wildcards. Emails can contain "_", so escape them
// or one customer's address could match another's.
function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

function normalizeEmail(email: string | null | undefined): string {
  return (email ?? '').trim().toLowerCase();
}

async function findLegacyOrderIdsByEmail(email: string): Promise<number[]> {
  const supabase = getSupabaseAdmin();
  const pattern = escapeLike(email);

  const [byOrder, byAddress] = await Promise.all([
    supabase
      .from('legacy_wc_orders')
      .select('id')
      .eq('type', 'shop_order')
      .ilike('billing_email', pattern)
      .limit(300),
    supabase
      .from('legacy_wc_order_addresses')
      .select('order_id')
      .eq('address_type', 'billing')
      .ilike('email', pattern)
      .limit(300),
  ]);
  if (byOrder.error) throw new Error(`legacy orders by email failed: ${byOrder.error.message}`);
  if (byAddress.error) throw new Error(`legacy addresses by email failed: ${byAddress.error.message}`);

  const ids = new Set<number>();
  for (const r of byOrder.data ?? []) ids.add(Number((r as any).id));
  for (const r of byAddress.data ?? []) ids.add(Number((r as any).order_id));
  return Array.from(ids).filter((n) => Number.isFinite(n));
}

export async function listMyLegacyOrders(rawEmail: string | null | undefined): Promise<MyLegacyOrder[]> {
  const email = normalizeEmail(rawEmail);
  if (!email) return [];

  const ids = await findLegacyOrderIdsByEmail(email);
  if (ids.length === 0) return [];

  const supabase = getSupabaseAdmin();
  const [ordersRes, itemsRes] = await Promise.all([
    supabase
      .from('legacy_wc_orders')
      .select('id, status, total_amount, date_created_gmt')
      .eq('type', 'shop_order')
      .in('id', ids),
    supabase
      .from('legacy_wc_order_items')
      .select('order_item_id, order_id, order_item_name')
      .in('order_id', ids)
      .eq('order_item_type', 'line_item')
      .order('order_item_id', { ascending: true }),
  ]);
  if (ordersRes.error) throw new Error(`legacy orders failed: ${ordersRes.error.message}`);
  if (itemsRes.error) throw new Error(`legacy items failed: ${itemsRes.error.message}`);

  const itemsByOrder = new Map<number, string[]>();
  for (const it of itemsRes.data ?? []) {
    const k = Number((it as any).order_id);
    if (!itemsByOrder.has(k)) itemsByOrder.set(k, []);
    itemsByOrder.get(k)!.push(String((it as any).order_item_name ?? ''));
  }

  return (ordersRes.data ?? [])
    .filter((o: any) => !HIDDEN_STATUSES.has(cleanStatus(String(o.status))))
    .map((o: any) => {
      const items = itemsByOrder.get(Number(o.id)) ?? [];
      return {
        id: Number(o.id),
        status: cleanStatus(String(o.status)),
        total_amount: num(o.total_amount),
        date_created_gmt: o.date_created_gmt ?? null,
        item_count: items.length,
        first_item: items[0] ?? null,
      } as MyLegacyOrder;
    })
    .sort((a, b) => {
      const ta = a.date_created_gmt ? new Date(a.date_created_gmt).getTime() : 0;
      const tb = b.date_created_gmt ? new Date(b.date_created_gmt).getTime() : 0;
      return tb - ta;
    });
}

// True only if this legacy order belongs to the given (verified) email.
export async function doesLegacyOrderBelongToEmail(
  orderId: number,
  rawEmail: string | null | undefined
): Promise<boolean> {
  const email = normalizeEmail(rawEmail);
  if (!email || !Number.isFinite(orderId)) return false;
  const ids = await findLegacyOrderIdsByEmail(email);
  return ids.includes(orderId);
}
