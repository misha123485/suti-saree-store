import { supabase } from './supabase';

// ---------------------------------------------------------------------
// Checkout "speak your address" (voice-to-text) -- admin controlled.
// Stored under the 'checkout_voice_input' settings key (same `settings`
// table as every other toggle, so NO SQL migration is needed).
//
//   enabled:          show the mic button on the checkout address fields.
//   default_language: language the mic listens in first.
//   show_language_switcher: let the customer change language (EN/HI/BN)
//                     next to the mic.
//   fields:           which address fields get a mic button.
//
// Defaults: ON, English (India) -- English-India recognises Hinglish
// names/places best AND returns Roman script, which couriers (Delhivery
// etc.) read easily. Hindi/Bengali return Devanagari/Bengali script.
// ---------------------------------------------------------------------
export type VoiceLang = 'en-IN' | 'hi-IN' | 'bn-IN';

export const VOICE_LANGUAGES: { code: VoiceLang; label: string; short: string }[] = [
  { code: 'en-IN', label: 'English (India)', short: 'EN' },
  { code: 'hi-IN', label: 'हिन्दी (Hindi)', short: 'हि' },
  { code: 'bn-IN', label: 'বাংলা (Bengali)', short: 'বা' },
];

export interface CheckoutVoiceSettings {
  enabled: boolean;
  default_language: VoiceLang;
  show_language_switcher: boolean;
  field_address: boolean;
  field_address2: boolean;
  field_landmark: boolean;
}

export const DEFAULT_CHECKOUT_VOICE_SETTINGS: CheckoutVoiceSettings = {
  enabled: true,
  default_language: 'en-IN',
  show_language_switcher: true,
  field_address: true,
  field_address2: true,
  field_landmark: true,
};

function isLang(v: unknown): v is VoiceLang {
  return v === 'en-IN' || v === 'hi-IN' || v === 'bn-IN';
}

export async function fetchCheckoutVoiceSettings(): Promise<CheckoutVoiceSettings> {
  const { data, error } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'checkout_voice_input')
    .maybeSingle();
  if (error || !data) return DEFAULT_CHECKOUT_VOICE_SETTINGS;
  const v = (data.value ?? {}) as Partial<CheckoutVoiceSettings>;
  const d = DEFAULT_CHECKOUT_VOICE_SETTINGS;
  return {
    enabled: typeof v.enabled === 'boolean' ? v.enabled : d.enabled,
    default_language: isLang(v.default_language) ? v.default_language : d.default_language,
    show_language_switcher:
      typeof v.show_language_switcher === 'boolean' ? v.show_language_switcher : d.show_language_switcher,
    field_address: typeof v.field_address === 'boolean' ? v.field_address : d.field_address,
    field_address2: typeof v.field_address2 === 'boolean' ? v.field_address2 : d.field_address2,
    field_landmark: typeof v.field_landmark === 'boolean' ? v.field_landmark : d.field_landmark,
  };
}

export async function saveCheckoutVoiceSettings(settings: CheckoutVoiceSettings) {
  const { error } = await supabase
    .from('settings')
    .upsert({ key: 'checkout_voice_input', value: settings }, { onConflict: 'key' });
  if (error) throw error;
}
