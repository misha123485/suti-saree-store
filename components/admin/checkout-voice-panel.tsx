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

function ToggleRow({
  id,
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <Label htmlFor={id}>{label}</Label>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </div>
  );
}

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

  const set = <K extends keyof CheckoutVoiceSettings>(key: K, value: CheckoutVoiceSettings[K]) =>
    setForm((f) => (f ? { ...f, [key]: value } : f));

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

  const off = !form.enabled;

  return (
    <div className="mt-4 grid max-w-xl gap-4 rounded-lg border border-border/60 bg-card p-5">
      <ToggleRow
        id="voice-enabled"
        label="Voice typing (mic button) on checkout address"
        hint="ON = customers see a mic button inside the address fields and can speak instead of typing."
        checked={form.enabled}
        onChange={(v) => set('enabled', v)}
      />

      <div className={off ? 'pointer-events-none opacity-50' : ''}>
        <Label htmlFor="voice-lang">Default speaking language</Label>
        <select
          id="voice-lang"
          value={form.default_language}
          onChange={(e) => set('default_language', e.target.value as CheckoutVoiceSettings['default_language'])}
          className="mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
        >
          {VOICE_LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>
              {l.label}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-muted-foreground">
          Recommended: English (India) — it understands Hinglish names and writes in English letters, which
          the courier can read. Hindi / Bengali are typed in Hindi / Bengali script.
        </p>
      </div>

      <div className={'grid gap-4 ' + (off ? 'pointer-events-none opacity-50' : '')}>
        <ToggleRow
          id="voice-switcher"
          label="Let customer change language"
          hint="Shows a small EN / हि / বা button next to the mic."
          checked={form.show_language_switcher}
          onChange={(v) => set('show_language_switcher', v)}
        />
        <div className="grid gap-3 rounded-md border border-border/60 p-3">
          <p className="text-xs font-medium text-muted-foreground">Show the mic on these fields</p>
          <ToggleRow
            id="voice-f-address"
            label="Street address"
            checked={form.field_address}
            onChange={(v) => set('field_address', v)}
          />
          <ToggleRow
            id="voice-f-address2"
            label="Apartment, suite, etc."
            checked={form.field_address2}
            onChange={(v) => set('field_address2', v)}
          />
          <ToggleRow
            id="voice-f-landmark"
            label="Landmark"
            checked={form.field_landmark}
            onChange={(v) => set('field_landmark', v)}
          />
        </div>
      </div>

      <p className="rounded-md border border-border/60 bg-muted/40 p-2 text-xs text-muted-foreground">
        Works in Chrome, Edge and Safari (Android, iPhone, desktop). Browsers without speech support (e.g.
        Firefox) simply do not show the mic. The browser sends the audio to its own speech service (Google /
        Apple) — nothing is stored by this store.
      </p>

      <Button type="button" onClick={save} disabled={saving} className="mt-2 w-fit bg-primary">
        {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
        {saving ? 'Saving…' : 'Save Voice Settings'}
      </Button>
    </div>
  );
}
