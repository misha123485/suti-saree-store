'use client';

import { useEffect, useRef, useState } from 'react';
import { Mic, Square, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { VoiceLanguage } from '@/lib/checkout-voice-settings';

export interface VoiceAddressResult {
  line1: string;
  line2: string;
  landmark: string;
  pincode: string;
}

const MAX_SECONDS = 25;

function pickMime(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  for (const m of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg']) {
    try {
      if (MediaRecorder.isTypeSupported(m)) return m;
    } catch {}
  }
  return '';
}

/**
 * "Speak your address" button. Customer taps, says the full address once
 * (house no, street, area, landmark, pincode), taps stop. The audio goes to
 * /api/checkout/voice-address (AI) which returns the split-up fields.
 */
export default function VoiceAddressButton({
  language,
  onResult,
}: {
  language: VoiceLanguage;
  onResult: (r: VoiceAddressResult) => void;
}) {
  const [supported, setSupported] = useState(false);
  const [state, setState] = useState<'idle' | 'recording' | 'processing'>('idle');
  const [seconds, setSeconds] = useState(0);
  const recRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setSupported(
      typeof navigator !== 'undefined' &&
        !!navigator.mediaDevices?.getUserMedia &&
        typeof MediaRecorder !== 'undefined'
    );
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  if (!supported) return null;

  const cleanup = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const upload = async (blob: Blob) => {
    setState('processing');
    try {
      const fd = new FormData();
      fd.append('audio', blob, 'address');
      fd.append('language', language);
      const res = await fetch('/api/checkout/voice-address', { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        toast.error(data.error || 'Voice typing failed. Please type your address.');
        return;
      }
      onResult({
        line1: data.line1 || '',
        line2: data.line2 || '',
        landmark: data.landmark || '',
        pincode: data.pincode || '',
      });
      toast.success('Address filled — please check it once.');
    } catch {
      toast.error('Voice typing needs internet. Please type your address.');
    } finally {
      setState('idle');
    }
  };

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = pickMime();
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        cleanup();
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || mime || 'audio/webm' });
        if (blob.size < 1000) {
          setState('idle');
          toast.message('Did not hear anything — please try again.');
          return;
        }
        void upload(blob);
      };
      recRef.current = rec;
      rec.start();
      setSeconds(0);
      setState('recording');
      timerRef.current = setInterval(() => {
        setSeconds((s) => {
          if (s + 1 >= MAX_SECONDS) recRef.current?.state === 'recording' && recRef.current.stop();
          return s + 1;
        });
      }, 1000);
    } catch {
      cleanup();
      setState('idle');
      toast.error('Microphone permission is blocked. Allow the mic in your browser settings and try again.');
    }
  };

  const stop = () => {
    if (recRef.current?.state === 'recording') recRef.current.stop();
  };

  if (state === 'processing') {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2.5 text-sm text-primary">
        <Loader2 className="h-4 w-4 animate-spin" /> Filling your address…
      </div>
    );
  }

  if (state === 'recording') {
    return (
      <button
        type="button"
        onClick={stop}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-red-500 px-3 py-2.5 text-sm font-semibold text-white"
      >
        <Square className="h-4 w-4 animate-pulse fill-current" />
        Listening… tap to finish ({seconds}s)
      </button>
    );
  }

  return (
    <div className="grid gap-1">
      <button
        type="button"
        onClick={start}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-primary/40 bg-primary/5 px-3 py-2.5 text-sm font-semibold text-primary hover:bg-primary/10"
      >
        <Mic className="h-4 w-4" />
        Speak your address
      </button>
      <p className="text-[11px] text-muted-foreground">
        Tap, then say house no., street, area, landmark and PIN code in Hindi, Bengali or English.
      </p>
    </div>
  );
}
