'use client';

import { useEffect, useRef, useState } from 'react';
import { Mic, Square } from 'lucide-react';
import { toast } from 'sonner';
import { VOICE_LANGUAGES, type VoiceLang } from '@/lib/checkout-voice-settings';

// Minimal typing for the (webkit-prefixed) Web Speech API.
type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: any) => void) | null;
  onerror: ((e: any) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

function getRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === 'undefined') return null;
  const w = window as any;
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

const LANG_STORAGE_KEY = 'checkout_voice_lang';

/**
 * Mic button that sits inside a text field. Tap -> speak -> the spoken
 * text is appended to the field's current value. Tap again to stop.
 * Renders nothing if the browser has no speech recognition (e.g. Firefox).
 */
export default function VoiceInputButton({
  value,
  onText,
  defaultLang,
  showLangSwitcher,
}: {
  /** Current text in the field (new speech is appended to it). */
  value: string;
  /** Called with the full new value of the field. */
  onText: (next: string) => void;
  defaultLang: VoiceLang;
  showLangSwitcher: boolean;
}) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [lang, setLang] = useState<VoiceLang>(defaultLang);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  // Text that was in the field when the mic started, so interim results
  // replace each other instead of piling up.
  const baseRef = useRef('');
  const latestValueRef = useRef(value);
  latestValueRef.current = value;

  useEffect(() => {
    setSupported(!!getRecognitionCtor());
    try {
      const saved = localStorage.getItem(LANG_STORAGE_KEY) as VoiceLang | null;
      if (saved && VOICE_LANGUAGES.some((l) => l.code === saved)) setLang(saved);
      else setLang(defaultLang);
    } catch {
      setLang(defaultLang);
    }
    return () => {
      recRef.current?.abort();
    };
  }, [defaultLang]);

  if (!supported) return null;

  const join = (base: string, spoken: string) => {
    const b = base.trim();
    const s = spoken.trim();
    if (!s) return base;
    return b ? `${b} ${s}` : s;
  };

  const start = () => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = lang;
    rec.continuous = false;
    rec.interimResults = true;
    baseRef.current = latestValueRef.current;

    rec.onresult = (e: any) => {
      let text = '';
      for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
      onText(join(baseRef.current, text));
    };
    rec.onerror = (e: any) => {
      const code = e?.error;
      if (code === 'not-allowed' || code === 'service-not-allowed') {
        toast.error('Microphone permission is blocked. Allow the mic in your browser settings and try again.');
      } else if (code === 'no-speech') {
        toast.message('Did not hear anything — tap the mic and try again.');
      } else if (code === 'network') {
        toast.error('Voice typing needs an internet connection.');
      } else if (code !== 'aborted') {
        toast.error('Voice typing failed. Please type your address.');
      }
    };
    rec.onend = () => {
      setListening(false);
      recRef.current = null;
    };
    try {
      rec.start();
      recRef.current = rec;
      setListening(true);
    } catch {
      setListening(false);
    }
  };

  const toggle = () => {
    if (listening) {
      recRef.current?.stop();
    } else {
      start();
    }
  };

  const nextLang = () => {
    const idx = VOICE_LANGUAGES.findIndex((l) => l.code === lang);
    const next = VOICE_LANGUAGES[(idx + 1) % VOICE_LANGUAGES.length].code;
    setLang(next);
    try {
      localStorage.setItem(LANG_STORAGE_KEY, next);
    } catch {}
    recRef.current?.abort();
  };

  const short = VOICE_LANGUAGES.find((l) => l.code === lang)?.short ?? 'EN';

  return (
    <div className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-1">
      {showLangSwitcher && !listening && (
        <button
          type="button"
          onClick={nextLang}
          aria-label="Change voice language"
          title="Change voice language"
          className="h-7 min-w-[28px] rounded-md border border-border bg-background px-1.5 text-[11px] font-semibold text-muted-foreground hover:bg-muted"
        >
          {short}
        </button>
      )}
      <button
        type="button"
        onClick={toggle}
        aria-label={listening ? 'Stop voice typing' : 'Speak to fill this field'}
        title={listening ? 'Tap to stop' : 'Tap and speak'}
        className={
          'flex h-8 w-8 items-center justify-center rounded-full transition-colors ' +
          (listening
            ? 'animate-pulse bg-red-500 text-white'
            : 'bg-primary/10 text-primary hover:bg-primary/20')
        }
      >
        {listening ? <Square className="h-3.5 w-3.5 fill-current" /> : <Mic className="h-4 w-4" />}
      </button>
    </div>
  );
}
