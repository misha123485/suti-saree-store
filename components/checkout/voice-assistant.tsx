'use client';

import { useEffect, useRef, useState } from 'react';
import { Mic, Loader2, Check, RotateCcw, SkipForward, X, Square } from 'lucide-react';
import { toast } from 'sonner';
import {
  VOICE_LANGUAGES,
  isVoiceLanguage,
  type VoiceLanguage,
} from '@/lib/checkout-voice-settings';

type StepKey = 'name' | 'phone' | 'email' | 'address';

export interface VoiceAssistantHandlers {
  onName: (first: string, last: string) => void;
  onPhone: (phone: string) => void;
  onEmail: (email: string) => void;
  onAddress: (a: { line1: string; line2: string; landmark: string; pincode: string }) => void;
}

// Questions in each language (what the assistant shows / reads aloud).
const Q: Record<StepKey, Record<VoiceLanguage, string>> = {
  name: {
    hi: 'आपका पूरा नाम क्या है?',
    en: 'What is your full name?',
    bn: 'আপনার পুরো নাম কী?',
    ta: 'உங்கள் முழு பெயர் என்ன?',
    te: 'మీ పూర్తి పేరు ఏమిటి?',
    mr: 'तुमचे पूर्ण नाव काय आहे?',
    gu: 'તમારું પૂરું નામ શું છે?',
    kn: 'ನಿಮ್ಮ ಪೂರ್ಣ ಹೆಸರು ಏನು?',
    ml: 'നിങ്ങളുടെ പൂർണ്ണ പേര് എന്താണ്?',
    pa: 'ਤੁਹਾਡਾ ਪੂਰਾ ਨਾਮ ਕੀ ਹੈ?',
  },
  phone: {
    hi: 'आपका मोबाइल नंबर क्या है?',
    en: 'What is your mobile number?',
    bn: 'আপনার মোবাইল নম্বর কত?',
    ta: 'உங்கள் மொபைல் எண் என்ன?',
    te: 'మీ మొబైల్ నంబర్ ఏమిటి?',
    mr: 'तुमचा मोबाइल नंबर काय आहे?',
    gu: 'તમારો મોબાઇલ નંબર શું છે?',
    kn: 'ನಿಮ್ಮ ಮೊಬೈಲ್ ಸಂಖ್ಯೆ ಏನು?',
    ml: 'നിങ്ങളുടെ മൊബൈൽ നമ്പർ എന്താണ്?',
    pa: 'ਤੁਹਾਡਾ ਮੋਬਾਈਲ ਨੰਬਰ ਕੀ ਹੈ?',
  },
  email: {
    hi: 'आपकी ईमेल आईडी क्या है?',
    en: 'What is your email address?',
    bn: 'আপনার ইমেইল আইডি কী?',
    ta: 'உங்கள் மின்னஞ்சல் முகவரி என்ன?',
    te: 'మీ ఇమెయిల్ చిరునామా ఏమిటి?',
    mr: 'तुमचा ईमेल आयडी काय आहे?',
    gu: 'તમારું ઈમેલ આઈડી શું છે?',
    kn: 'ನಿಮ್ಮ ಇಮೇಲ್ ವಿಳಾಸ ಏನು?',
    ml: 'നിങ്ങളുടെ ഇമെയിൽ വിലാസം എന്താണ്?',
    pa: 'ਤੁਹਾਡੀ ਈਮੇਲ ਆਈਡੀ ਕੀ ਹੈ?',
  },
  address: {
    hi: 'आपका पूरा पता बताइए: मकान नंबर, गली, इलाका, लैंडमार्क और पिन कोड।',
    en: 'Tell your full address: house number, street, area, landmark and PIN code.',
    bn: 'আপনার পুরো ঠিকানা বলুন: বাড়ির নম্বর, রাস্তা, এলাকা, ল্যান্ডমার্ক ও পিন কোড।',
    ta: 'உங்கள் முழு முகவரியைச் சொல்லுங்கள்: வீட்டு எண், தெரு, பகுதி, அடையாளம், பின் கோடு.',
    te: 'మీ పూర్తి చిరునామా చెప్పండి: ఇంటి నంబర్, వీధి, ప్రాంతం, ల్యాండ్‌మార్క్, పిన్ కోడ్.',
    mr: 'तुमचा पूर्ण पत्ता सांगा: घर क्रमांक, रस्ता, परिसर, खूण आणि पिन कोड.',
    gu: 'તમારું પૂરું સરનામું જણાવો: ઘર નંબર, શેરી, વિસ્તાર, લેન્ડમાર્ક અને પિન કોડ.',
    kn: 'ನಿಮ್ಮ ಪೂರ್ಣ ವಿಳಾಸ ಹೇಳಿ: ಮನೆ ಸಂಖ್ಯೆ, ರಸ್ತೆ, ಪ್ರದೇಶ, ಹೆಗ್ಗುರುತು, ಪಿನ್ ಕೋಡ್.',
    ml: 'നിങ്ങളുടെ പൂർണ്ണ വിലാസം പറയുക: വീട്ടുനമ്പർ, തെരുവ്, പ്രദേശം, ലാൻഡ്മാർക്ക്, പിൻ കോഡ്.',
    pa: 'ਆਪਣਾ ਪੂਰਾ ਪਤਾ ਦੱਸੋ: ਮਕਾਨ ਨੰਬਰ, ਗਲੀ, ਇਲਾਕਾ, ਲੈਂਡਮਾਰਕ ਅਤੇ ਪਿੰਨ ਕੋਡ।',
  },
};

const EN_HELP: Record<StepKey, string> = {
  name: 'Say your full name',
  phone: 'Say your 10-digit mobile number',
  email: 'Say your email (e.g. “name at the rate gmail dot com”)',
  address: 'Say house no., street, area, landmark and PIN code',
};

const LANG_KEY = 'checkout_voice_lang';
const MAX_SECONDS = 25;
const NO_SPEECH_MS = 8000;
const SILENCE_MS = 1600;
const SPEECH_LEVEL = 0.04;

type Phase = 'asking' | 'listening' | 'processing' | 'confirm';

function pickMime(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  for (const m of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg']) {
    try {
      if (MediaRecorder.isTypeSupported(m)) return m;
    } catch {}
  }
  return '';
}

export default function VoiceAssistant({
  language: defaultLanguage,
  askEmail,
  speakQuestions,
  handlers,
}: {
  language: VoiceLanguage;
  askEmail: boolean;
  speakQuestions: boolean;
  handlers: VoiceAssistantHandlers;
}) {
  const [supported, setSupported] = useState(false);
  const [open, setOpen] = useState(false);
  const [lang, setLang] = useState<VoiceLanguage>(defaultLanguage);
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<Phase>('asking');
  const [seconds, setSeconds] = useState(0);
  const [summary, setSummary] = useState('');
  const [problem, setProblem] = useState('');

  const steps: StepKey[] = askEmail ? ['name', 'phone', 'email', 'address'] : ['name', 'phone', 'address'];

  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeRef = useRef(false); // false once the panel is closed
  const langRef = useRef(lang);
  langRef.current = lang;
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;
  const stepsRef = useRef(steps);
  stepsRef.current = steps;

  useEffect(() => {
    setSupported(
      typeof navigator !== 'undefined' &&
        !!navigator.mediaDevices?.getUserMedia &&
        typeof MediaRecorder !== 'undefined'
    );
    try {
      const saved = localStorage.getItem(LANG_KEY);
      setLang(isVoiceLanguage(saved) ? saved : defaultLanguage);
    } catch {
      setLang(defaultLanguage);
    }
    return () => teardown();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultLanguage]);

  const teardown = () => {
    activeRef.current = false;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    try {
      if (recRef.current && recRef.current.state !== 'inactive') {
        recRef.current.onstop = null;
        recRef.current.stop();
      }
    } catch {}
    recRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    try {
      ctxRef.current?.close();
    } catch {}
    ctxRef.current = null;
    try {
      window.speechSynthesis?.cancel();
    } catch {}
  };

  if (!supported) return null;

  // ---- reading the question aloud (only if the phone has a voice for it) ----
  const speak = (text: string, code: VoiceLanguage) =>
    new Promise<void>((resolve) => {
      try {
        const synth = window.speechSynthesis;
        const info = VOICE_LANGUAGES.find((l) => l.code === code);
        if (!synth || !info) return resolve();
        const voices = synth.getVoices();
        if (!voices.some((v) => v.lang.toLowerCase().startsWith(code))) return resolve();
        synth.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.lang = info.tts;
        u.onend = () => resolve();
        u.onerror = () => resolve();
        setTimeout(resolve, 9000);
        synth.speak(u);
      } catch {
        resolve();
      }
    });

  // ---- one step: ask -> listen -> process -> confirm ----
  const runStep = async (i: number) => {
    if (!activeRef.current) return;
    setIdx(i);
    setProblem('');
    setSummary('');
    setPhase('asking');
    if (speakQuestions) await speak(Q[stepsRef.current[i]][langRef.current], langRef.current);
    if (!activeRef.current) return;
    listen(i);
  };

  const listen = (i: number) => {
    const stream = streamRef.current;
    if (!stream || !activeRef.current) return;
    const mime = pickMime();
    let rec: MediaRecorder;
    try {
      rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    } catch {
      toast.error('Voice typing is not available on this device. Please type.');
      close();
      return;
    }
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    rec.onstop = () => {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
      if (!activeRef.current) return;
      const blob = new Blob(chunks, { type: rec.mimeType || mime || 'audio/webm' });
      if (blob.size < 1500) {
        setProblem('Did not hear anything. Please say it again.');
        setPhase('confirm');
        return;
      }
      void send(i, blob);
    };
    recRef.current = rec;
    rec.start();
    setSeconds(0);
    setPhase('listening');

    // Auto-stop when the customer stops talking.
    let analyser: AnalyserNode | null = null;
    let buf: Uint8Array | null = null;
    try {
      const ctx = ctxRef.current;
      if (ctx) {
        void ctx.resume();
        analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        ctx.createMediaStreamSource(stream).connect(analyser);
        buf = new Uint8Array(analyser.fftSize);
      }
    } catch {
      analyser = null;
    }
    const startedAt = Date.now();
    let spoke = false;
    let lastLoud = Date.now();
    timerRef.current = setInterval(() => {
      const now = Date.now();
      setSeconds(Math.floor((now - startedAt) / 1000));
      if (analyser && buf) {
        analyser.getByteTimeDomainData(buf);
        let peak = 0;
        for (let k = 0; k < buf.length; k++) peak = Math.max(peak, Math.abs(buf[k] - 128) / 128);
        if (peak > SPEECH_LEVEL) {
          spoke = true;
          lastLoud = now;
        }
        if (spoke && now - lastLoud > SILENCE_MS) return stopRec();
        if (!spoke && now - startedAt > NO_SPEECH_MS) return stopRec();
      }
      if (now - startedAt > MAX_SECONDS * 1000) stopRec();
    }, 120);
  };

  const stopRec = () => {
    if (recRef.current && recRef.current.state === 'recording') recRef.current.stop();
  };

  const send = async (i: number, blob: Blob) => {
    setPhase('processing');
    const key = stepsRef.current[i];
    try {
      const fd = new FormData();
      fd.append('audio', blob, 'voice');
      fd.append('field', key);
      fd.append('language', langRef.current);
      const res = await fetch('/api/checkout/voice-address', { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      if (!activeRef.current) return;
      if (!res.ok || !data.ok) {
        setProblem(data.error || 'Voice typing failed. You can skip and type it.');
        setPhase('confirm');
        return;
      }
      const h = handlersRef.current;
      if (key === 'name') {
        if (!data.first_name) return fail('Could not catch the name. Please say it again.');
        h.onName(data.first_name, data.last_name || '');
        setSummary([data.first_name, data.last_name].filter(Boolean).join(' '));
      } else if (key === 'phone') {
        if (!data.phone) return fail('Could not get a 10-digit number. Please say it again, digit by digit.');
        h.onPhone(data.phone);
        setSummary(data.phone);
      } else if (key === 'email') {
        if (!data.email) return fail('Could not get a valid email. Please say it again or skip.');
        h.onEmail(data.email);
        setSummary(data.email);
      } else {
        if (!data.line1 && !data.pincode) return fail('Could not catch the address. Please say it again.');
        h.onAddress({
          line1: data.line1 || '',
          line2: data.line2 || '',
          landmark: data.landmark || '',
          pincode: data.pincode || '',
        });
        setSummary(
          [data.line1, data.line2, data.landmark, data.pincode].filter(Boolean).join(', ')
        );
      }
      setProblem('');
      setPhase('confirm');
    } catch {
      if (!activeRef.current) return;
      setProblem('Voice typing needs internet. You can skip and type it.');
      setPhase('confirm');
    }
  };

  const fail = (msg: string) => {
    setSummary('');
    setProblem(msg);
    setPhase('confirm');
  };

  const next = () => {
    const n = idx + 1;
    if (n >= stepsRef.current.length) {
      toast.success('Details filled — please check them once.');
      close();
    } else {
      void runStep(n);
    }
  };

  const begin = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      try {
        const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
        ctxRef.current = AC ? new AC() : null;
      } catch {
        ctxRef.current = null;
      }
      activeRef.current = true;
      setOpen(true);
      void runStep(0);
    } catch {
      toast.error('Microphone permission is blocked. Allow the mic in your browser settings and try again.');
    }
  };

  const close = () => {
    teardown();
    setOpen(false);
    setPhase('asking');
  };

  const changeLang = (v: string) => {
    if (!isVoiceLanguage(v)) return;
    setLang(v);
    langRef.current = v;
    try {
      localStorage.setItem(LANG_KEY, v);
    } catch {}
  };

  const langSelect = (
    <select
      value={lang}
      onChange={(e) => changeLang(e.target.value)}
      aria-label="Speaking language"
      className="h-9 rounded-md border border-input bg-background px-2 text-xs"
    >
      {VOICE_LANGUAGES.map((l) => (
        <option key={l.code} value={l.code}>
          {l.label}
        </option>
      ))}
    </select>
  );

  if (!open) {
    return (
      <div className="mb-4 grid gap-1.5 rounded-lg border border-primary/30 bg-primary/5 p-3">
        <button
          type="button"
          onClick={begin}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2.5 text-sm font-semibold text-primary-foreground"
        >
          <Mic className="h-4 w-4" />
          Speak to fill details
        </button>
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] text-muted-foreground">
            AI asks name, phone{askEmail ? ', email' : ''} and address one by one. Answer in your language.
          </p>
          {langSelect}
        </div>
      </div>
    );
  }

  const key = steps[idx];
  return (
    <div className="mb-4 grid gap-3 rounded-lg border border-primary/40 bg-primary/5 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-primary">
          Question {idx + 1} of {steps.length}
        </span>
        <div className="flex items-center gap-2">
          {langSelect}
          <button type="button" onClick={close} aria-label="Close voice assistant" className="rounded-full p-1.5 hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div>
        <p className="text-base font-semibold leading-snug">{Q[key][lang]}</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">{EN_HELP[key]}</p>
      </div>

      {phase === 'asking' && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Asking…
        </p>
      )}

      {phase === 'listening' && (
        <button
          type="button"
          onClick={stopRec}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-red-500 px-3 py-2.5 text-sm font-semibold text-white"
        >
          <Square className="h-4 w-4 animate-pulse fill-current" />
          Listening… speak now ({seconds}s) — tap when done
        </button>
      )}

      {phase === 'processing' && (
        <p className="flex items-center gap-2 text-sm text-primary">
          <Loader2 className="h-4 w-4 animate-spin" /> Writing it in English…
        </p>
      )}

      {phase === 'confirm' && (
        <div className="grid gap-2">
          {summary && (
            <p className="rounded-md border border-emerald-200 bg-emerald-50 p-2 text-sm font-medium text-emerald-800">
              {summary}
            </p>
          )}
          {problem && (
            <p className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">{problem}</p>
          )}
          <div className="flex flex-wrap gap-2">
            {summary && (
              <button
                type="button"
                onClick={next}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground"
              >
                <Check className="h-4 w-4" />
                {idx + 1 >= steps.length ? 'Done' : 'Correct, next'}
              </button>
            )}
            <button
              type="button"
              onClick={() => void runStep(idx)}
              className="flex items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium"
            >
              <RotateCcw className="h-4 w-4" /> Say again
            </button>
            {!summary && (
              <button
                type="button"
                onClick={next}
                className="flex items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium"
              >
                <SkipForward className="h-4 w-4" /> Skip
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
