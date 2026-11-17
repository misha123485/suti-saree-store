import { supabase } from './supabase';

// ---------------------------------------------------------------------
// Checkout "Speak your address" (AI voice) -- admin controlled.
// Stored under the 'checkout_voice_input' settings key in the existing
// `settings` table, so NO SQL migration is needed.
//
//   enabled:  show the "Speak your address" button on checkout.
//   language: hint for the speech model. 'auto' lets it detect Hindi /
//             English / Bengali / Hinglish by itself (recommended).
// ---------------------------------------------------------------------
export type VoiceLanguage = 'auto' | 'hi' | 'en' | 'bn';

export const VOICE_LANGUAGE_OPTIONS: { code: VoiceLanguage; label: string }[] = [
  { code: 'auto', label: 'Auto detect (Hindi / English / Bengali / Hinglish)' },
  { code: 'hi', label: 'Hindi / Hinglish' },
  { code: 'en', label: 'English' },
  { code: 'bn', label: 'Bengali' },
];

export interface CheckoutVoiceSettings {
  enabled: boolean;
  language: VoiceLanguage;
}

export const DEFAULT_CHECKOUT_VOICE_SETTINGS: CheckoutVoiceSettings = {
  enabled: true,
  language: 'auto',
};

function isLang(v: unknown): v is VoiceLanguage {
  return v === 'auto' || v === 'hi' || v === 'en' || v === 'bn';
}

export async function fetchCheckoutVoiceSettings(): Promise<CheckoutVoiceSettings> {
  const { data, error } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'checkout_voice_input')
    .maybeSingle();
  if (error || !data) return DEFAULT_CHECKOUT_VOICE_SETTINGS;
  const v = (data.value ?? {}) as Partial<CheckoutVoiceSettings>;
  return {
    enabled: typeof v.enabled === 'boolean' ? v.enabled : true,
    language: isLang(v.language) ? v.language : 'auto',
  };
}

export async function saveCheckoutVoiceSettings(settings: CheckoutVoiceSettings) {
  const { error } = await supabase
    .from('settings')
    .upsert({ key: 'checkout_voice_input', value: settings }, { onConflict: 'key' });
  if (error) throw error;
}
