import { NextResponse } from 'next/server';
import { revalidatePath, revalidateTag } from 'next/cache';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { INTL_CACHE_TAG, requireAdmin } from '@/lib/intl-server';
import { SUPPORTED_CURRENCIES, type IntlCountry } from '@/lib/intl-api';

// Updates the admin-editable fields of EXISTING countries (the 11 seeded rows). Codes cannot be
// created or deleted here: adding a new country also needs a currency/FX entry, see docs.

export async function PUT(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { countries?: Partial<IntlCountry>[] } | null;
  if (!body || !Array.isArray(body.countries) || body.countries.length === 0 || body.countries.length > 50) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const db = getSupabaseAdmin();
  const { data: existing, error: loadErr } = await db.from('intl_countries').select('code');
  if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 });
  const known = new Set((existing || []).map((r) => r.code as string));

  const rows: Array<Omit<IntlCountry, 'code'> & { code: string }> = [];
  for (const c of body.countries) {
    const code = String(c.code || '').toUpperCase();
    if (!known.has(code)) return NextResponse.json({ error: `Unknown country code "${code}"` }, { status: 400 });
    const name = String(c.name || '').trim();
    if (!name || name.length > 60) return NextResponse.json({ error: `${code}: name is required (max 60 chars)` }, { status: 400 });
    const currency = String(c.currency || '').toUpperCase();
    if (!(SUPPORTED_CURRENCIES as readonly string[]).includes(currency)) {
      return NextResponse.json({ error: `${code}: unsupported currency "${currency}"` }, { status: 400 });
    }
    const regex = String(c.postal_regex ?? '').trim();
    if (regex) {
      try {
        new RegExp(regex);
      } catch {
        return NextResponse.json({ error: `${code}: postal code pattern is not a valid regex` }, { status: 400 });
      }
    }
    rows.push({
      code,
      name,
      currency,
      postal_regex: regex || null,
      requires_state: c.requires_state === true,
      is_enabled: c.is_enabled === true,
      sort: Math.round(Number(c.sort) || 0),
      vat_note: String(c.vat_note ?? '').trim().slice(0, 300) || null,
      notes: String(c.notes ?? '').trim().slice(0, 500) || null,
    });
  }

  for (const r of rows) {
    const { code, ...rest } = r;
    const { error } = await db.from('intl_countries').update(rest).eq('code', code);
    if (error) return NextResponse.json({ error: `${code}: ${error.message}` }, { status: 500 });
  }

  revalidateTag(INTL_CACHE_TAG);
  revalidatePath('/', 'layout');
  const { data } = await db.from('intl_countries').select('*').order('sort');
  return NextResponse.json({ success: true, countries: (data || []) as IntlCountry[] });
}
