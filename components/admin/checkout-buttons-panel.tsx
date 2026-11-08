'use client';

import { useEffect, useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  CheckoutButtonsSettings,
  DEFAULT_CHECKOUT_BUTTONS_SETTINGS,
  fetchCheckoutButtonsSettings,
  saveCheckoutButtonsSettings,
} from '@/lib/checkout-buttons-settings';

function ToggleRow({
  id,
  label,
  hint,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <Label htmlFor={id}>{label}</Label>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

export default function CheckoutButtonsPanel() {
  const [form, setForm] = useState<CheckoutButtonsSettings | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchCheckoutButtonsSettings()
      .then(setForm)
      .catch(() => {
        setForm(DEFAULT_CHECKOUT_BUTTONS_SETTINGS);
        toast.error('Failed to load checkout button settings');
      });
  }, []);

  if (!form) return <p className="py-4 text-sm text-muted-foreground">Loading…</p>;

  const bothOff = !form.payment_buttons_enabled && !form.sticky_button_enabled;

  const save = async () => {
    setSaving(true);
    try {
      await saveCheckoutButtonsSettings(form);
      toast.success('Checkout buttons saved');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-4 grid max-w-xl gap-4 rounded-lg border border-border/60 bg-card p-5">
      <ToggleRow
        id="checkout-payment-buttons"
        label="Payment section buttons (Pay Online / COD)"
        hint="ON = under the payment options, the button of the selected method is shown (Pay securely or Place Order COD)."
        checked={form.payment_buttons_enabled}
        onChange={(v) => setForm((f) => (f ? { ...f, payment_buttons_enabled: v } : f))}
      />
      <ToggleRow
        id="checkout-sticky-button"
        label="Sticky bottom button (mobile)"
        hint="ON = price + pay button bar fixed at the bottom of the screen on mobile."
        checked={form.sticky_button_enabled}
        onChange={(v) => setForm((f) => (f ? { ...f, sticky_button_enabled: v } : f))}
      />
      {bothOff && (
        <p className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
          Both are OFF. So customers can still order on mobile, the sticky bottom button will stay ON.
        </p>
      )}
      <Button type="button" onClick={save} disabled={saving} className="mt-2 w-fit bg-primary">
        {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
        {saving ? 'Saving…' : 'Save Checkout Buttons'}
      </Button>
    </div>
  );
}
