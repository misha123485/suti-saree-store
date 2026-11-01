// ONE place for "INR price -> price in the visitor's currency" (client AND server safe).
//
// Formula (identical to the SQL function intl_inr_to_minor() used by place_order_with_items(),
// which stays the source of truth for what is actually charged):
//   foreign = inr * (1 + intl_price_markup%) / (fx_rate / (1 + fx_markup%))   then rounded by price_rounding.
// Used by: storefront price display (via formatINR), checkout preview and, in Phase 8, the Merchant
// Center feed -- so Google never sees a price that differs from the landing page.
import { previewInrToMinor, formatMinor, type InternationalSettings } from './intl-api';

export interface DisplayCurrency {
  countryCode: string; // ISO-2, e.g. 'US'
  countryName: string; // as stored in intl_countries.name, e.g. 'United States'
  currency: string; // e.g. 'USD'
  settings: InternationalSettings;
}

/** INR -> minor units of `currency`, including the admin's international price markup. */
export function convertInrToMinor(inr: number, currency: string, settings: InternationalSettings): number {
  const withMarkup = inr * (1 + Math.max(settings.intl_price_markup_percent || 0, 0) / 100);
  return previewInrToMinor(withMarkup, currency, settings);
}

/** e.g. 5000 -> "$54.99". Negative amounts (discount lines) keep their sign. */
export function formatInrAs(inr: number, currency: string, settings: InternationalSettings): string {
  const minor = convertInrToMinor(Math.abs(inr), currency, settings);
  const text = formatMinor(minor, currency);
  return inr < 0 && minor > 0 ? `-${text}` : text;
}

export function minorToMajor(minor: number, currency: string): number {
  const digits = ['OMR', 'BHD', 'KWD'].includes(currency.toUpperCase()) ? 3 : 2;
  return minor / Math.pow(10, digits);
}

// ---- Display currency (browser only) -------------------------------------------------------
// formatINR() consults this, so every existing price on the storefront switches currency without
// editing 60+ components. It is null for India visitors, on the server, and in admin/vendor areas,
// so those always show plain INR exactly as before.
let providerDisplay: DisplayCurrency | null = null;
let currentDisplay: DisplayCurrency | null = null;

/** source 'provider' = the visitor's chosen country; 'checkout' = the country picked on the checkout page. */
export function setDisplayCurrency(d: DisplayCurrency | null, source: 'provider' | 'checkout' = 'provider'): void {
  if (source === 'provider') providerDisplay = d;
  currentDisplay = d;
}

export function getProviderDisplay(): DisplayCurrency | null {
  return providerDisplay;
}

export function restoreProviderDisplay(): void {
  currentDisplay = providerDisplay;
}

export function getDisplayCurrency(): DisplayCurrency | null {
  if (typeof window === 'undefined' || !currentDisplay) return null;
  const p = window.location.pathname;
  if (p.startsWith('/admin') || p.startsWith('/vendor') || p.startsWith('/account/reseller')) return null;
  return currentDisplay;
}
