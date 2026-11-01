// Server-only helpers for international selling (used by admin API routes, the public config
// endpoint and later phases: checkout, feed, Stripe). Do NOT import from a client component.

import { cookies } from 'next/headers';
import { unstable_cache } from 'next/cache';
import { verifyAdminToken, ADMIN_SESSION_COOKIE } from '@/lib/admin-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import {
  normalizeInternationalSettings,
  type InternationalSettings,
  type IntlCountry,
  type ShippingZone,
} from '@/lib/intl-api';

export const INTL_CACHE_TAG = 'intl';

export async function requireAdmin(): Promise<boolean> {
  const cookie = cookies().get(ADMIN_SESSION_COOKIE)?.value ?? null;
  const verified = await verifyAdminToken(cookie);
  return verified.valid;
}

export function toZone(row: Record<string, unknown>): ShippingZone {
  return {
    id: String(row.id),
    name: String(row.name ?? ''),
    countries: Array.isArray(row.countries) ? (row.countries as string[]) : [],
    base_rate_inr: Number(row.base_rate_inr) || 0,
    per_extra_500g_inr: Number(row.per_extra_500g_inr) || 0,
    free_shipping_threshold_inr: Number(row.free_shipping_threshold_inr) || 0,
    min_order_inr: Number(row.min_order_inr) || 0,
    eta_min_days: row.eta_min_days == null ? null : Number(row.eta_min_days),
    eta_max_days: row.eta_max_days == null ? null : Number(row.eta_max_days),
    courier: (row.courier as string | null) ?? null,
    is_active: row.is_active === true,
  };
}

const loadPublicConfig = unstable_cache(
  async () => {
    const db = getSupabaseAdmin();
    const [{ data: s }, { data: c }, { data: z }] = await Promise.all([
      db.from('settings').select('value').eq('key', 'international_settings').maybeSingle(),
      db.from('intl_countries').select('code,name,currency,postal_regex,requires_state,is_enabled,sort,vat_note').eq('is_enabled', true).order('sort'),
      db.from('shipping_zones').select('*').eq('is_active', true).order('created_at'),
    ]);
    const settings = normalizeInternationalSettings(s?.value as Partial<InternationalSettings> | undefined);
    const countries = ((c || []) as Array<Omit<IntlCountry, 'notes'>>).map((r) => ({ ...r, notes: null })) as IntlCountry[];
    const zones = (z || []).map((r) => toZone(r as Record<string, unknown>));
    return { settings, countries, zones };
  },
  ['intl-public-config'],
  { revalidate: 60, tags: [INTL_CACHE_TAG] },
);

/** Master flag + enabled countries + active zones. Empty lists while international_enabled is false. */
export async function getPublicInternationalConfig() {
  const cfg = await loadPublicConfig();
  if (!cfg.settings.international_enabled) return { ...cfg, countries: [] as IntlCountry[], zones: [] as ShippingZone[] };
  return cfg;
}

/** Enabled countries that also have an active shipping zone (what a customer can really order to). */
export async function getEnabledCountries(): Promise<IntlCountry[]> {
  const cfg = await getPublicInternationalConfig();
  return cfg.countries.filter((c) => cfg.zones.some((z) => z.countries.includes(c.code)));
}

export async function getZoneForCountry(code: string): Promise<ShippingZone | null> {
  const cfg = await getPublicInternationalConfig();
  const cc = String(code || '').toUpperCase();
  return cfg.zones.find((z) => z.countries.includes(cc)) ?? null;
}
