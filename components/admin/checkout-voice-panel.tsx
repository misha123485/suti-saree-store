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
  VOICE_LANGUAGE_OPTIONS,
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
          <Label htmlFor="voice-enabled">“Speak your address” button on checkout</Label>
          <p className="text-xs text-muted-foreground">
            ON = customer taps the mic, says the full address once, and AI fills Street, Apartment,
            Landmark and PIN code (City/State then fill automatically from the PIN).
          </p>
        </div>
        <Switch
          id="voice-enabled"
          checked={form.enabled}
          onCheckedChange={(v) => setForm((f) => (f ? { ...f, enabled: v } : f))}
        />
      </div>

      <div className={form.enabled ? '' : 'pointer-events-none opacity-50'}>
        <Label htmlFor="voice-lang">Speaking language</Label>
        <select
          id="voice-lang"
          value={form.language}
          onChange={(e) =>
            setForm((f) => (f ? { ...f, language: e.target.value as CheckoutVoiceSettings['language'] } : f))
          }
          className="mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
        >
          {VOICE_LANGUAGE_OPTIONS.map((l) => (
            <option key={l.code} value={l.code}>
              {l.label}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-muted-foreground">
          Recommended: Auto detect. The address is always saved in English letters so the courier can read
          it.
        </p>
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
