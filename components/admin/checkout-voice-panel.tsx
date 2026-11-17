'use client';

import { useEffect, useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  CheckoutVoiceSettings,
  DEFAULT_CHECKOUT_VOICE_SETTINGS,
  VOICE_LANGUAGES,
  fetchCheckoutVoiceSettings,
  saveCheckoutVoiceSettings,
} from '@/lib/checkout-voice-settings';

export default function CheckoutVoicePanel() {
  const [form, setForm] = useState<CheckoutVoiceSettings | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchCheckoutVoiceSettings()
      .then(setForm)
      .catch(() => {
        setForm(DEFAULT_CHECKOUT_VOICE_SETTINGS);
        toast.error('Failed to load voice input settings');
      });
  }, []);

  if (!form) return <p className="py-4 text-sm text-muted-foreground">Loading…</p>;

  const save = async () => {
    setSaving(true);
    try {
      await saveCheckoutVoiceSettings(form);
      toast.success('Voice input settings saved');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-4 grid max-w-xl gap-4 rounded-lg border border-border/60 bg-card p-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <Label htmlFor="voice-enabled">“Speak to fill details” on checkout</Label>
          <p className="text-xs text-muted-foreground">
            ON = a voice assistant at the top of checkout asks name, phone, email and address one by one.
            Customer answers in their own language; AI fills the fields in English letters (City/State
            then fill automatically from the PIN code).
          </p>
        </div>
        <Switch
          id="voice-enabled"
          checked={form.enabled}
          onCheckedChange={(v) => setForm((f) => (f ? { ...f, enabled: v } : f))}
        />
      </div>

      <div className={form.enabled ? '' : 'pointer-events-none opacity-50'}>
        <Label htmlFor="voice-lang">Starting language</Label>
        <select
          id="voice-lang"
          value={form.language}
          onChange={(e) =>
            setForm((f) => (f ? { ...f, language: e.target.value as CheckoutVoiceSettings['language'] } : f))
          }
          className="mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
        >
          {VOICE_LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>
              {l.label}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-muted-foreground">
          Customers can change the language themselves (it is remembered on their phone). Hindi works
          for Hinglish too. Values are always saved in English letters so the courier can read them.
        </p>
      </div>

      <div className={'grid gap-4 ' + (form.enabled ? '' : 'pointer-events-none opacity-50')}>
        <div className="flex items-center justify-between gap-4">
          <div>
            <Label htmlFor="voice-email">Also ask for email</Label>
            <p className="text-xs text-muted-foreground">Customer can skip it. Not asked to logged-in customers.</p>
          </div>
          <Switch
            id="voice-email"
            checked={form.ask_email}
            onCheckedChange={(v) => setForm((f) => (f ? { ...f, ask_email: v } : f))}
          />
        </div>
        <div className="flex items-center justify-between gap-4">
          <div>
            <Label htmlFor="voice-speak">Read questions aloud</Label>
            <p className="text-xs text-muted-foreground">
              Phone speaks each question (only if it has a voice for that language). Questions are always
              shown on screen too.
            </p>
          </div>
          <Switch
            id="voice-speak"
            checked={form.speak_questions}
            onCheckedChange={(v) => setForm((f) => (f ? { ...f, speak_questions: v } : f))}
          />
        </div>
      </div>

      <div className="flex items-center justify-between gap-4">
        <div>
          <Label htmlFor="suggest-enabled">Address suggestions while typing (free)</Label>
          <p className="text-xs text-muted-foreground">
            ON = as the customer types in Street address, matching places appear below; tapping one fills
            street, area, PIN, city and state. Free (OpenStreetMap), no key.
          </p>
        </div>
        <Switch
          id="suggest-enabled"
          checked={form.suggest_enabled}
          onCheckedChange={(v) => setForm((f) => (f ? { ...f, suggest_enabled: v } : f))}
        />
      </div>

      <div className="flex items-center justify-between gap-4">
        <div>
          <Label htmlFor="loc-enabled">“Use my current location” button (free)</Label>
          <p className="text-xs text-muted-foreground">
            ON = one tap fills street, area and PIN code from the customer’s phone GPS. No API key, no cost.
            Works even if the voice assistant above is OFF.
          </p>
        </div>
        <Switch
          id="loc-enabled"
          checked={form.location_enabled}
          onCheckedChange={(v) => setForm((f) => (f ? { ...f, location_enabled: v } : f))}
        />
      </div>

      <p className="rounded-md border border-border/60 bg-muted/40 p-2 text-xs text-muted-foreground">
        Uses the same <b>GROQ_API_KEY</b> as the AI chat (Vercel environment variable) — no extra key. Groq
        free tier is enough for normal traffic. If the key is missing, customers see “please type your
        address” and checkout keeps working.
      </p>

      <Button type="button" onClick={save} disabled={saving} className="mt-2 w-fit bg-primary">
        {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
        {saving ? 'Saving…' : 'Save Voice Settings'}
      </Button>
    </div>
  );
}
