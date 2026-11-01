// Phase 7: loads what the legal pages need to describe international selling.
// Uses the same anon-key server client as the rest of the legal-page code (no next/headers), so it can
// be called from the /legal pages, the AI chat route and the live-chat widget alike.
// Everything read here is public by design: international_settings (no secrets), enabled countries,
// active zones and store_info. When international selling is OFF this costs one tiny query.

import { getServerSupabase } from './supabase-server';
import { normalizeInternationalSettings, type IntlCountry, type InternationalSettings, type ShippingZone } from './intl-api';
import { DISABLED_INTL_LEGAL_CONTEXT, type IntlLegalContext } from './legal-intl';

function rowToZone(row: Record<string, unknown>): ShippingZone {
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

export async function fetchIntlLegalContext(): Promise<IntlLegalContext> {
  try {
    const db = getServerSupabase();
    const { data: s } = await db.from('settings').select('value').eq('key', 'international_settings').maybeSingle();
    const settings = normalizeInternationalSettings(s?.value as Partial<InternationalSettings> | undefined);
    if (!settings.international_enabled) return DISABLED_INTL_LEGAL_CONTEXT;

    const [{ data: c }, { data: z }, { data: store }] = await Promise.all([
      db.from('intl_countries').select('code,name,currency,postal_regex,requires_state,is_enabled,sort,vat_note').eq('is_enabled', true).order('sort'),
      db.from('shipping_zones').select('*').eq('is_active', true).order('created_at'),
      db.from('settings').select('value').eq('key', 'store_info').maybeSingle(),
    ]);
    const zones = (z || []).map((r) => rowToZone(r as Record<string, unknown>));
    // Only countries a customer can really order to (enabled AND covered by an active zone).
    const countries = ((c || []) as Array<Omit<IntlCountry, 'notes'>>)
      .map((r) => ({ ...r, notes: null }) as IntlCountry)
      .filter((r) => zones.some((zone) => zone.countries.includes(r.code)));
    if (countries.length === 0) return DISABLED_INTL_LEGAL_CONTEXT;

    const info = (store?.value || {}) as Partial<IntlLegalContext['store']>;
    return {
      enabled: true,
      settings,
      countries,
      zones,
      store: {
        name: info.name || 'Sutisaree',
        address: info.address || '',
        support_email: info.support_email || '',
        support_phone: info.support_phone || '',
      },
    };
  } catch {
    // Never break a policy page because of the international add-on.
    return DISABLED_INTL_LEGAL_CONTEXT;
  }
}
