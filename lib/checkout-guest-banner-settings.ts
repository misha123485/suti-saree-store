import { supabase } from './supabase';

// ---------------------------------------------------------------------
// Checkout "Checking out as a guest" box -- admin controlled.
// Stored under the 'checkout_guest_banner' key in the existing
// `settings` table, so NO SQL migration is needed.
//
//   enabled:            show the guest line (one line of text + Log in /
//                       Sign up links, no box) at the top of checkout for guests.
//                       Logged-in customers always see "Logged in as ...".
//   message:            the text on the left.
//   login_button_text:  label of the Log in link.
//   signup_button_text: label of the Sign up link.
//
// An empty text falls back to the default text.
// ---------------------------------------------------------------------
export interface CheckoutGuestBannerSettings {
  enabled: boolean;
  message: string;
  login_button_text: string;
  signup_button_text: string;
}

export const DEFAULT_CHECKOUT_GUEST_BANNER_SETTINGS: CheckoutGuestBannerSettings = {
  enabled: true,
  message: 'Already have an account?',
  login_button_text: 'Log in',
  signup_button_text: 'Sign up',
};

// Old default texts (from the previous 2-line box design). If the admin
// never changed them, they are saved in the DB as-is -- swap them for the
// new short defaults so the checkout line stays on ONE line.
const LEGACY_TEXTS: Partial<Record<keyof CheckoutGuestBannerSettings, string[]>> = {
  message: ['Checking out as a guest — no account needed.'],
  login_button_text: ['Have an account? Log in'],
};

function text(
  v: unknown,
  fallback: string,
  legacy: string[] = []
): string {
  if (typeof v !== 'string' || !v.trim()) return fallback;
  const t = v.trim();
  return legacy.includes(t) ? fallback : t;
}

export function normalizeCheckoutGuestBanner(
  raw: Partial<CheckoutGuestBannerSettings> | null | undefined
): CheckoutGuestBannerSettings {
  const d = DEFAULT_CHECKOUT_GUEST_BANNER_SETTINGS;
  const v = raw ?? {};
  return {
    enabled: typeof v.enabled === 'boolean' ? v.enabled : d.enabled,
    message: text(v.message, d.message, LEGACY_TEXTS.message),
    login_button_text: text(v.login_button_text, d.login_button_text, LEGACY_TEXTS.login_button_text),
    signup_button_text: text(v.signup_button_text, d.signup_button_text),
  };
}

export async function fetchCheckoutGuestBannerSettings(): Promise<CheckoutGuestBannerSettings> {
  const { data, error } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'checkout_guest_banner')
    .maybeSingle();
  if (error || !data) return DEFAULT_CHECKOUT_GUEST_BANNER_SETTINGS;
  return normalizeCheckoutGuestBanner((data.value ?? {}) as Partial<CheckoutGuestBannerSettings>);
}

export async function saveCheckoutGuestBannerSettings(settings: CheckoutGuestBannerSettings) {
  const { error } = await supabase
    .from('settings')
    .upsert({ key: 'checkout_guest_banner', value: settings }, { onConflict: 'key' });
  if (error) throw error;
}
