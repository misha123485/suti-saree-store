// Checkout helpers for international orders (client-safe). The database function
// place_order_with_items() re-validates and recomputes everything; these only give the
// customer fast feedback and an estimate of what they will pay.

import type { IntlCountry } from '@/lib/intl-api';

export type PublicIntlCountry = Omit<IntlCountry, 'notes'> & { notes?: string | null };

export interface PublicIntlZone {
  id: string;
  name: string;
  countries: string[];
  base_rate_inr: number;
  per_extra_500g_inr: number;
  free_shipping_threshold_inr: number;
  min_order_inr: number;
  eta_min_days: number | null;
  eta_max_days: number | null;
}

/** International phone: starts with "+" and country code, 8-15 digits in total. */
export function isValidIntlPhone(raw: string): boolean {
  const v = raw.trim();
  if (!v.startsWith('+')) return false;
  if (!/^\+[\d\s().-]+$/.test(v)) return false;
  const digits = v.replace(/\D/g, '');
  return digits.length >= 8 && digits.length <= 15;
}

/** Postal code check against the country's regex (blank regex = anything goes, even empty). */
export function isValidIntlPostal(regex: string | null | undefined, value: string): boolean {
  if (!regex) return true;
  try {
    return new RegExp(regex, 'i').test(value.trim());
  } catch {
    return false;
  }
}

/** Same maths as the RPC: base covers the first 500 g, each further started 500 g adds the extra rate. */
export function estimateIntlShipping(
  zone: PublicIntlZone | null,
  totalQuantity: number,
  gramsPerItem: number,
  itemsInrAfterDiscounts: number,
): number {
  if (!zone) return 0;
  if (zone.free_shipping_threshold_inr > 0 && itemsInrAfterDiscounts >= zone.free_shipping_threshold_inr) return 0;
  const grams = Math.max(totalQuantity, 0) * Math.max(gramsPerItem, 1);
  return zone.base_rate_inr + zone.per_extra_500g_inr * Math.ceil(Math.max(grams - 500, 0) / 500);
}

export function formatEta(zone: PublicIntlZone | null): string | null {
  if (!zone || zone.eta_min_days == null || zone.eta_max_days == null) return null;
  return zone.eta_min_days === zone.eta_max_days
    ? `${zone.eta_min_days} days`
    : `${zone.eta_min_days}–${zone.eta_max_days} days`;
}
