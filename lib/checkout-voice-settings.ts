import { supabase } from './supabase';

// ---------------------------------------------------------------------
// Checkout "Speak to fill" (AI voice assistant) -- admin controlled.
// Stored under the 'checkout_voice_input' settings key in the existing
// `settings` table, so NO SQL migration is needed.
//
//   enabled:         show the voice assistant on checkout.
//   language:        language the assistant starts in (customer can change).
//   ask_email:       also ask for the email (skippable by the customer).
//   suggest_enabled: address suggestions dropdown while typing Street address.
//   location_enabled: show the free "Use my current location" button.
//   speak_questions: assistant reads each question aloud (if the phone
//                    has a voice for that language) besides showing it.
//
// NOTE: the speech model is told the language explicitly -- "auto detect"
// mis-heard Hinglish as random languages, so there is no auto option.
// ---------------------------------------------------------------------
export type VoiceLanguage = 'hi' | 'en' | 'bn' | 'ta' | 'te' | 'mr' | 'gu' | 'kn' | 'ml' | 'pa';

export interface VoiceLanguageInfo {
  code: VoiceLanguage;
  label: string; // shown in dropdowns
  tts: string; // BCP-47 tag for reading questions aloud
}

export const VOICE_LANGUAGES: VoiceLanguageInfo[] = [
  { code: 'hi', label: 'हिन्दी (Hindi / Hinglish)', tts: 'hi-IN' },
  { code: 'en', label: 'English', tts: 'en-IN' },
  { code: 'bn', label: 'বাংলা (Bengali)', tts: 'bn-IN' },
  { code: 'ta', label: 'தமிழ் (Tamil)', tts: 'ta-IN' },
  { code: 'te', label: 'తెలుగు (Telugu)', tts: 'te-IN' },
  { code: 'mr', label: 'मराठी (Marathi)', tts: 'mr-IN' },
  { code: 'gu', label: 'ગુજરાતી (Gujarati)', tts: 'gu-IN' },
  { code: 'kn', label: 'ಕನ್ನಡ (Kannada)', tts: 'kn-IN' },
  { code: 'ml', label: 'മലയാളം (Malayalam)', tts: 'ml-IN' },
  { code: 'pa', label: 'ਪੰਜਾਬੀ (Punjabi)', tts: 'pa-IN' },
];

export interface CheckoutVoiceSettings {
  enabled: boolean;
  language: VoiceLanguage;
  ask_email: boolean;
  speak_questions: boolean;
  location_enabled: boolean;
  suggest_enabled: boolean;
}

export const DEFAULT_CHECKOUT_VOICE_SETTINGS: CheckoutVoiceSettings = {
  enabled: true,
  language: 'hi',
  ask_email: true,
  speak_questions: true,
  location_enabled: true,
  suggest_enabled: true,
};

export function isVoiceLanguage(v: unknown): v is VoiceLanguage {
  return VOICE_LANGUAGES.some((l) => l.code === v);
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
    // older saved value 'auto' (or anything unknown) falls back to Hindi
    language: isVoiceLanguage(v.language) ? v.language : d.language,
    ask_email: typeof v.ask_email === 'boolean' ? v.ask_email : d.ask_email,
    speak_questions: typeof v.speak_questions === 'boolean' ? v.speak_questions : d.speak_questions,
    location_enabled: typeof v.location_enabled === 'boolean' ? v.location_enabled : d.location_enabled,
    suggest_enabled: typeof v.suggest_enabled === 'boolean' ? v.suggest_enabled : d.suggest_enabled,
  };
}

export async function saveCheckoutVoiceSettings(settings: CheckoutVoiceSettings) {
  const { error } = await supabase
    .from('settings')
    .upsert({ key: 'checkout_voice_input', value: settings }, { onConflict: 'key' });
  if (error) throw error;
}
