'use client';

import { useEffect, useState } from 'react';
import { Loader2, RotateCcw, Save } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  CheckoutGuestBannerSettings,
  DEFAULT_CHECKOUT_GUEST_BANNER_SETTINGS,
  fetchCheckoutGuestBannerSettings,
  saveCheckoutGuestBannerSettings,
} from '@/lib/checkout-guest-banner-settings';

export default function CheckoutGuestBannerPanel() {
  const [form, setForm] = useState<CheckoutGuestBannerSettings | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchCheckoutGuestBannerSettings()
      .then(setForm)
      .catch(() => {
        setForm(DEFAULT_CHECKOUT_GUEST_BANNER_SETTINGS);
        toast.error('Failed to load guest checkout box settings');
      });
  }, []);

  if (!form) return <p className="py-4 text-sm text-muted-foreground">Loading…</p>;

  const set = <K extends keyof CheckoutGuestBannerSettings>(k: K, v: CheckoutGuestBannerSettings[K]) =>
    setForm((f) => (f ? { ...f, [k]: v } : f));

  const save = async () => {
    setSaving(true);
    try {
      await saveCheckoutGuestBannerSettings(form);
      toast.success('Guest checkout box saved');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const d = DEFAULT_CHECKOUT_GUEST_BANNER_SETTINGS;

  return (
    <div className="mt-4 grid max-w-xl gap-4 rounded-lg border border-border/60 bg-card p-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <Label htmlFor="guest-banner-enabled">Show guest box on checkout</Label>
          <p className="text-xs text-muted-foreground">
            ON = guests see the message with Log in / Sign up buttons at the top of checkout. OFF = the whole box is hidden.
            Logged-in customers still see “Logged in as …”.
          </p>
        </div>
        <Switch
          id="guest-banner-enabled"
          checked={form.enabled}
          onCheckedChange={(v) => set('enabled', v)}
        />
      </div>

      <div className={`grid gap-4 ${form.enabled ? '' : 'pointer-events-none opacity-50'}`}>
        <div className="grid gap-1.5">
          <Label htmlFor="guest-banner-message">Message</Label>
          <Input
            id="guest-banner-message"
            value={form.message}
            maxLength={160}
            onChange={(e) => set('message', e.target.value)}
            placeholder={d.message}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="guest-banner-login">Log in button text</Label>
          <Input
            id="guest-banner-login"
            value={form.login_button_text}
            maxLength={40}
            onChange={(e) => set('login_button_text', e.target.value)}
            placeholder={d.login_button_text}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="guest-banner-signup">Sign up button text</Label>
          <Input
            id="guest-banner-signup"
            value={form.signup_button_text}
            maxLength={40}
            onChange={(e) => set('signup_button_text', e.target.value)}
            placeholder={d.signup_button_text}
          />
        </div>

        <div className="rounded-xl border border-primary/20 bg-primary/5 p-3.5">
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Preview</p>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-xs text-muted-foreground sm:text-sm">{form.message || d.message}</span>
            <div className="grid shrink-0 grid-cols-2 gap-2">
              <span className="rounded-lg border border-primary bg-background px-3 py-2 text-center text-xs font-semibold text-primary">
                {form.login_button_text || d.login_button_text}
              </span>
              <span className="rounded-lg bg-primary px-3 py-2 text-center text-xs font-semibold text-primary-foreground shadow-sm">
                {form.signup_button_text || d.signup_button_text}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap gap-2">
        <Button type="button" onClick={save} disabled={saving} className="w-fit bg-primary">
          {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
          {saving ? 'Saving…' : 'Save Guest Box'}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => setForm((f) => ({ ...d, enabled: f ? f.enabled : d.enabled }))}
        >
          <RotateCcw className="mr-1.5 h-4 w-4" />
          Reset texts
        </Button>
      </div>
    </div>
  );
}
