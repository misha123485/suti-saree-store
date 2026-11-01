import { NextResponse } from 'next/server';
import { revalidatePath, revalidateTag } from 'next/cache';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { INTL_CACHE_TAG, requireAdmin, toZone } from '@/lib/intl-server';
import {
  normalizeExportDetails,
  normalizeInternationalCosts,
  normalizeInternationalSettings,
  type IntlCountry,
} from '@/lib/intl-api';

// Admin-only read/write of the international settings keys. Writes use the service role because
// anon/authenticated are blocked from these keys by RLS (migration 20261102000000).

const KEYS = {
  settings: 'international_settings',
  costs: 'international_costs',
  export_details: 'export_details',
} as const;

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const db = getSupabaseAdmin();
  const [s, c, e, countries, zones] = await Promise.all([
    db.from('settings').select('value').eq('key', KEYS.settings).maybeSingle(),
    db.from('settings').select('value').eq('key', KEYS.costs).maybeSingle(),
    db.from('settings').select('value').eq('key', KEYS.export_details).maybeSingle(),
    db.from('intl_countries').select('*').order('sort'),
    db.from('shipping_zones').select('*').order('created_at'),
  ]);
  const err = s.error || c.error || e.error || countries.error || zones.error;
  if (err) return NextResponse.json({ error: err.message }, { status: 500 });
  return NextResponse.json({
    settings: normalizeInternationalSettings(s.data?.value as never),
    costs: normalizeInternationalCosts(c.data?.value as never),
    export_details: normalizeExportDetails(e.data?.value as never),
    countries: (countries.data || []) as IntlCountry[],
    zones: (zones.data || []).map((r) => toZone(r as Record<string, unknown>)),
  });
}

export async function PUT(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { section?: string; value?: unknown } | null;
  const section = body?.section as keyof typeof KEYS | undefined;
  if (!body || !section || !(section in KEYS) || typeof body.value !== 'object' || body.value === null) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const db = getSupabaseAdmin();
  let value: unknown;
  if (section === 'settings') {
    const s = normalizeInternationalSettings(body.value as never);
    if (s.international_enabled) {
      // Safety: never switch the master flag on with nothing sellable behind it.
      const [{ data: countries }, { data: zones }] = await Promise.all([
        db.from('intl_countries').select('code').eq('is_enabled', true),
        db.from('shipping_zones').select('countries').eq('is_active', true),
      ]);
      const zoned = new Set((zones || []).flatMap((z) => (z.countries as string[]) || []));
      const sellable = (countries || []).some((c) => zoned.has(c.code as string));
      if (!sellable) {
        return NextResponse.json(
          { error: 'Enable at least one country AND an active shipping zone covering it before turning International Selling on.' },
          { status: 400 },
        );
      }
    }
    value = s;
  } else if (section === 'costs') {
    value = normalizeInternationalCosts(body.value as never);
  } else {
    value = normalizeExportDetails(body.value as never);
  }

  const { error } = await db.from('settings').upsert({ key: KEYS[section], value }, { onConflict: 'key' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  revalidateTag(INTL_CACHE_TAG);
  revalidatePath('/', 'layout');
  return NextResponse.json({ success: true, value });
}
