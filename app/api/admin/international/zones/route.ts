import { NextResponse } from 'next/server';
import { revalidatePath, revalidateTag } from 'next/cache';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { INTL_CACHE_TAG, requireAdmin, toZone } from '@/lib/intl-server';

type ZoneBody = Record<string, unknown>;

function intIn(v: unknown, min: number, max: number): number | null {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  const r = Math.round(n);
  return r < min || r > max ? null : r;
}

async function validate(body: ZoneBody, selfId: string | null) {
  const db = getSupabaseAdmin();
  const name = String(body.name ?? '').trim();
  if (!name || name.length > 60) return { error: 'Zone name is required (max 60 chars).' };

  const countries = Array.isArray(body.countries)
    ? Array.from(new Set((body.countries as unknown[]).map((c) => String(c).toUpperCase())))
    : [];
  if (countries.length === 0) return { error: 'Select at least one country for the zone.' };

  const { data: known } = await db.from('intl_countries').select('code');
  const knownCodes = new Set((known || []).map((r) => r.code as string));
  const bad = countries.find((c) => !knownCodes.has(c));
  if (bad) return { error: `Unknown country "${bad}".` };

  const base = intIn(body.base_rate_inr, 0, 200000);
  const extra = intIn(body.per_extra_500g_inr ?? 0, 0, 200000);
  const free = intIn(body.free_shipping_threshold_inr ?? 0, 0, 10000000);
  const minOrder = intIn(body.min_order_inr ?? 0, 0, 10000000);
  if (base === null || extra === null || free === null || minOrder === null) {
    return { error: 'Rates and amounts must be whole numbers of rupees (0 or more).' };
  }

  const etaMin = body.eta_min_days === '' || body.eta_min_days == null ? null : intIn(body.eta_min_days, 1, 90);
  const etaMax = body.eta_max_days === '' || body.eta_max_days == null ? null : intIn(body.eta_max_days, 1, 90);
  if ((body.eta_min_days != null && body.eta_min_days !== '' && etaMin === null) ||
      (body.eta_max_days != null && body.eta_max_days !== '' && etaMax === null)) {
    return { error: 'Delivery days must be between 1 and 90.' };
  }
  if (etaMin !== null && etaMax !== null && etaMin > etaMax) return { error: 'Min delivery days cannot exceed max.' };

  const is_active = body.is_active === true;
  if (is_active) {
    // The order RPC uses the first active zone that lists the country, so two active zones must not overlap.
    const { data: others } = await db.from('shipping_zones').select('id,name,countries').eq('is_active', true);
    for (const o of others || []) {
      if (selfId && o.id === selfId) continue;
      const clash = ((o.countries as string[]) || []).find((c) => countries.includes(c));
      if (clash) return { error: `${clash} is already covered by the active zone "${o.name}". Remove it there first.` };
    }
  }

  return {
    row: {
      name,
      countries,
      base_rate_inr: base,
      per_extra_500g_inr: extra,
      free_shipping_threshold_inr: free,
      min_order_inr: minOrder,
      eta_min_days: etaMin,
      eta_max_days: etaMax,
      courier: String(body.courier ?? '').trim().slice(0, 60) || null,
      is_active,
      updated_at: new Date().toISOString(),
    },
  };
}

function purge() {
  revalidateTag(INTL_CACHE_TAG);
  revalidatePath('/', 'layout');
}

export async function POST(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = (await req.json().catch(() => null)) as ZoneBody | null;
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  const v = await validate(body, null);
  if ('error' in v) return NextResponse.json({ error: v.error }, { status: 400 });
  const { data, error } = await getSupabaseAdmin().from('shipping_zones').insert(v.row).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  purge();
  return NextResponse.json({ success: true, zone: toZone(data as Record<string, unknown>) });
}

export async function PUT(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = (await req.json().catch(() => null)) as ZoneBody | null;
  const id = String(body?.id ?? '');
  if (!body || !id) return NextResponse.json({ error: 'Zone id is required' }, { status: 400 });
  const v = await validate(body, id);
  if ('error' in v) return NextResponse.json({ error: v.error }, { status: 400 });
  const { data, error } = await getSupabaseAdmin().from('shipping_zones').update(v.row).eq('id', id).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  purge();
  return NextResponse.json({ success: true, zone: toZone(data as Record<string, unknown>) });
}

export async function DELETE(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Zone id is required' }, { status: 400 });
  const { error } = await getSupabaseAdmin().from('shipping_zones').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  purge();
  return NextResponse.json({ success: true });
}
