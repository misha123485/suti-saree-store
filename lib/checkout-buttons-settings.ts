import { supabase } from './supabase';

// ---------------------------------------------------------------------
// Checkout pay-button visibility -- admin controlled.
// Stored under the 'checkout_buttons' settings key.
//
//   payment_buttons_enabled: the button shown right under the payment
//     options (Pay Online / Cash on Delivery). Only the button of the
//     CURRENTLY SELECTED method is shown.
//   sticky_button_enabled: the mobile bottom (sticky) bar with the price
//     and the pay button.
//
// Both default to ON. Safety net (see resolveCheckoutButtons): on mobile
// there must always be at least one way to place the order, so if the
// admin switches BOTH off, the sticky bar stays on.
// ---------------------------------------------------------------------
export interface CheckoutButtonsSettings {
  payment_buttons_enabled: boolean;
  sticky_button_enabled: boolean;
}

export const DEFAULT_CHECKOUT_BUTTONS_SETTINGS: CheckoutButtonsSettings = {
  payment_buttons_enabled: true,
  sticky_button_enabled: true,
};

export function resolveCheckoutButtons(s: CheckoutButtonsSettings): CheckoutButtonsSettings {
  if (!s.payment_buttons_enabled && !s.sticky_button_enabled) {
    return { ...s, sticky_button_enabled: true };
  }
  return s;
}

export async function fetchCheckoutButtonsSettings(): Promise<CheckoutButtonsSettings> {
  const { data, error } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'checkout_buttons')
    .maybeSingle();
  if (error || !data) return DEFAULT_CHECKOUT_BUTTONS_SETTINGS;
  const v = (data.value ?? {}) as Partial<CheckoutButtonsSettings>;
  return {
    payment_buttons_enabled:
      typeof v.payment_buttons_enabled === 'boolean' ? v.payment_buttons_enabled : true,
    sticky_button_enabled: typeof v.sticky_button_enabled === 'boolean' ? v.sticky_button_enabled : true,
  };
}

export async function saveCheckoutButtonsSettings(settings: CheckoutButtonsSettings) {
  const { error } = await supabase
    .from('settings')
    .upsert({ key: 'checkout_buttons', value: settings }, { onConflict: 'key' });
  if (error) throw error;
}
