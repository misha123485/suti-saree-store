// International selling: shared types, defaults and normalisers (safe for server AND client).
// Data lives in: settings.international_settings (public-read), settings.international_costs and
// settings.export_details (admin-only), tables intl_countries and shipping_zones.
// See supabase/migrations/20261102000000_international_orders_foundation.sql.
// Admin writes always go through /api/admin/international/* (service role).

export const SUPPORTED_CURRENCIES = ['USD', 'AED', 'GBP', 'MYR', 'AUD', 'CAD', 'OMR', 'BHD', 'QAR', 'SAR', 'KWD'] as const;
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];
export const THREE_DECIMAL_CURRENCIES = ['OMR', 'BHD', 'KWD'];

export type PriceRounding = 'x.99' | 'x.00' | 'none';
export type DutyMode = 'DAP' | 'DDP';

export interface InternationalSettings {
  international_enabled: boolean;
  fx_markup_percent: number;
  /** INR per 1 unit of each currency. */
  fx_rates: Record<string, number>;
  intl_price_markup_percent: number;
  price_rounding: PriceRounding;
  default_duty_mode: DutyMode;
  return_window_days_intl: number;
  default_item_weight_grams: number;
}

/** Admin-only (never readable with the public key). */
export interface InternationalCosts {
  stripe_fee_percent: number;
  stripe_fixed_fee_inr: number;
}

/** Admin-only. Used on the export invoice (Phase 6). */
export interface ExportDetails {
  iec: string;
  gstin: string;
  lut_number: string;
  lut_date: string;
  ad_code: string;
  default_hs_code: string;
}

export interface IntlCountry {
  code: string;
  name: string;
  currency: string;
  postal_regex: string | null;
  requires_state: boolean;
  is_enabled: boolean;
  sort: number;
  vat_note: string | null;
  notes: string | null;
}

export interface ShippingZone {
  id: string;
  name: string;
  countries: string[];
  base_rate_inr: number;
  per_extra_500g_inr: number;
  free_shipping_threshold_inr: number;
  min_order_inr: number;
  eta_min_days: number | null;
  eta_max_days: number | null;
  courier: string | null;
  is_active: boolean;
}

export const DEFAULT_INTERNATIONAL_SETTINGS: InternationalSettings = {
  international_enabled: false,
  fx_markup_percent: 2,
  fx_rates: { USD: 90, AED: 24.5, GBP: 115, MYR: 20, AUD: 58, CAD: 65, OMR: 235, BHD: 240, QAR: 24.7, SAR: 24, KWD: 295 },
  intl_price_markup_percent: 0,
  price_rounding: 'x.99',
  default_duty_mode: 'DAP',
  return_window_days_intl: 7,
  default_item_weight_grams: 700,
};

export const DEFAULT_INTERNATIONAL_COSTS: InternationalCosts = { stripe_fee_percent: 3, stripe_fixed_fee_inr: 0 };

export const DEFAULT_EXPORT_DETAILS: ExportDetails = {
  iec: '',
  gstin: '',
  lut_number: '',
  lut_date: '',
  ad_code: '',
  default_hs_code: '',
};

function num(v: unknown, fallback: number, min: number, max: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function normalizeInternationalSettings(raw: Partial<InternationalSettings> | null | undefined): InternationalSettings {
  const r = (raw || {}) as Partial<InternationalSettings>;
  const fx: Record<string, number> = {};
  for (const cur of SUPPORTED_CURRENCIES) {
    const given = Number((r.fx_rates || {})[cur]);
    fx[cur] = Number.isFinite(given) && given > 0 ? given : DEFAULT_INTERNATIONAL_SETTINGS.fx_rates[cur];
  }
  return {
    international_enabled: r.international_enabled === true,
    fx_markup_percent: num(r.fx_markup_percent, 2, 0, 50),
    fx_rates: fx,
    intl_price_markup_percent: num(r.intl_price_markup_percent, 0, 0, 100),
    price_rounding: r.price_rounding === 'x.00' || r.price_rounding === 'none' ? r.price_rounding : 'x.99',
    default_duty_mode: r.default_duty_mode === 'DDP' ? 'DDP' : 'DAP',
    return_window_days_intl: Math.round(num(r.return_window_days_intl, 7, 0, 90)),
    default_item_weight_grams: Math.round(num(r.default_item_weight_grams, 700, 50, 20000)),
  };
}

export function normalizeInternationalCosts(raw: Partial<InternationalCosts> | null | undefined): InternationalCosts {
  const r = (raw || {}) as Partial<InternationalCosts>;
  return {
    stripe_fee_percent: num(r.stripe_fee_percent, 3, 0, 20),
    stripe_fixed_fee_inr: Math.round(num(r.stripe_fixed_fee_inr, 0, 0, 1000)),
  };
}

export function normalizeExportDetails(raw: Partial<ExportDetails> | null | undefined): ExportDetails {
  const r = (raw || {}) as Partial<ExportDetails>;
  const s = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);
  return {
    iec: s(r.iec, 20),
    gstin: s(r.gstin, 20).toUpperCase(),
    lut_number: s(r.lut_number, 60),
    lut_date: s(r.lut_date, 20),
    ad_code: s(r.ad_code, 30),
    default_hs_code: s(r.default_hs_code, 20),
  };
}

/**
 * Preview of the INR -> foreign minor-unit conversion. MUST stay identical to the SQL function
 * intl_inr_to_minor() (the database is the source of truth for what is actually charged).
 */
export function previewInrToMinor(inr: number, currency: string, s: InternationalSettings): number {
  const rate = s.fx_rates[currency];
  if (!rate || rate <= 0 || !(inr > 0)) return 0;
  const foreign = inr / (rate / (1 + Math.max(s.fx_markup_percent, 0) / 100));
  const three = THREE_DECIMAL_CURRENCIES.includes(currency);
  if (three) {
    if (s.price_rounding === 'x.99') return Math.ceil(foreign * 20) * 50;
    if (s.price_rounding === 'x.00') return Math.ceil(foreign) * 1000;
    return Math.ceil(foreign * 100) * 10;
  }
  if (s.price_rounding === 'x.99') return Math.ceil(foreign) * 100 - 1;
  if (s.price_rounding === 'x.00') return Math.ceil(foreign) * 100;
  return Math.ceil(foreign * 100);
}

export function formatMinor(minor: number, currency: string): string {
  const digits = THREE_DECIMAL_CURRENCIES.includes(currency) ? 3 : 2;
  const value = minor / Math.pow(10, digits);
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency, minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
  } catch {
    return `${currency} ${value.toFixed(digits)}`;
  }
}

/** Shipping for a parcel, same maths as the RPC: base covers 500 g, each further started 500 g adds extra. */
export function previewZoneShipping(zone: ShippingZone, weightGrams: number, itemsInr: number): number {
  if (zone.free_shipping_threshold_inr > 0 && itemsInr >= zone.free_shipping_threshold_inr) return 0;
  return zone.base_rate_inr + zone.per_extra_500g_inr * Math.ceil(Math.max(weightGrams - 500, 0) / 500);
}

// ---------- admin client fetchers (browser) ----------
export interface InternationalAdminData {
  settings: InternationalSettings;
  costs: InternationalCosts;
  export_details: ExportDetails;
  countries: IntlCountry[];
  zones: ShippingZone[];
}

async function parse<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || 'Request failed');
  return data as T;
}

export async function fetchInternationalAdmin(): Promise<InternationalAdminData> {
  return parse<InternationalAdminData>(await fetch('/api/admin/international', { cache: 'no-store' }));
}

export async function saveInternationalSection(
  section: 'settings' | 'costs' | 'export_details',
  value: InternationalSettings | InternationalCosts | ExportDetails,
): Promise<{ value: unknown }> {
  return parse(await fetch('/api/admin/international', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ section, value }),
  }));
}

export async function saveIntlCountries(countries: IntlCountry[]): Promise<{ countries: IntlCountry[] }> {
  return parse(await fetch('/api/admin/international/countries', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ countries }),
  }));
}

export async function saveShippingZone(zone: Partial<ShippingZone> & { name: string }): Promise<{ zone: ShippingZone }> {
  return parse(await fetch('/api/admin/international/zones', {
    method: zone.id ? 'PUT' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(zone),
  }));
}

export async function deleteShippingZone(id: string): Promise<void> {
  await parse(await fetch(`/api/admin/international/zones?id=${encodeURIComponent(id)}`, { method: 'DELETE' }));
}
