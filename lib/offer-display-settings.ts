import { supabase } from './supabase';

// ---------------------------------------------------------------------
// Product-page "Mega Deal" offer card — admin controlled.
// Stored under the 'product_offer_display' settings key. Off by default,
// so the product page keeps the existing "Get this at ₹X via online
// payment" pill until the admin switches this on.
// ---------------------------------------------------------------------
export interface OfferDisplaySettings {
  /** Master switch: true = Mega Deal card + offers sheet, false = old simple pill. */
  enabled: boolean;
  /** Small badge text on the sheet header, e.g. "Mega Deal". */
  badge_text: string;
  show_online_payment: boolean;
  show_coupons: boolean;
  /** 'all' = every coupon marked "show on product page"; 'selected' = only selected_coupon_codes. */
  coupon_mode: 'all' | 'selected';
  selected_coupon_codes: string[];
  /** Logged-in customers only. */
  show_loyalty: boolean;
  show_store_credit: boolean;
}

export const DEFAULT_OFFER_DISPLAY_SETTINGS: OfferDisplaySettings = {
  enabled: false,
  badge_text: 'Mega Deal',
  show_online_payment: true,
  show_coupons: true,
  coupon_mode: 'all',
  selected_coupon_codes: [],
  show_loyalty: true,
  show_store_credit: true,
};

export async function fetchOfferDisplaySettings(): Promise<OfferDisplaySettings> {
  const { data, error } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'product_offer_display')
    .maybeSingle();
  if (error || !data) return DEFAULT_OFFER_DISPLAY_SETTINGS;
  return { ...DEFAULT_OFFER_DISPLAY_SETTINGS, ...(data.value as Partial<OfferDisplaySettings>) };
}

export async function saveOfferDisplaySettings(settings: OfferDisplaySettings) {
  const { error } = await supabase
    .from('settings')
    .upsert({ key: 'product_offer_display', value: settings }, { onConflict: 'key' });
  if (error) throw error;
}
