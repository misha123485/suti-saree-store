'use client';

import { useEffect, useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { fetchCoupons, Coupon } from '@/lib/coupons-api';
import {
  OfferDisplaySettings,
  DEFAULT_OFFER_DISPLAY_SETTINGS,
  fetchOfferDisplaySettings,
  saveOfferDisplaySettings,
} from '@/lib/offer-display-settings';

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

export default function OfferDisplayPanel() {
  const [form, setForm] = useState<OfferDisplaySettings | null>(null);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchOfferDisplaySettings()
      .then(setForm)
      .catch(() => {
        setForm(DEFAULT_OFFER_DISPLAY_SETTINGS);
        toast.error('Failed to load offer display settings');
      });
    fetchCoupons().then(setCoupons).catch(() => {});
  }, []);

  if (!form) return <p className="py-4 text-sm text-muted-foreground">Loading…</p>;

  const set = (patch: Partial<OfferDisplaySettings>) => setForm((f) => (f ? { ...f, ...patch } : f));

  const toggleCode = (code: string, on: boolean) =>
    set({
      selected_coupon_codes: on
        ? Array.from(new Set([...form.selected_coupon_codes, code]))
        : form.selected_coupon_codes.filter((c) => c !== code),
    });

  const save = async () => {
    setSaving(true);
    try {
      await saveOfferDisplaySettings(form);
      toast.success('Offer display saved');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const activeCoupons = coupons.filter((c) => c.is_active);

  return (
    <div className="mt-4 grid max-w-xl gap-4 rounded-lg border border-border/60 bg-card p-5">
      <ToggleRow
        id="offer-display-enabled"
        label="Show Mega Deal offer card"
        hint='ON = "Get at ₹X · Extra ₹Y Off" card with a details sheet. OFF = old simple "Get this at ₹X via online payment" pill.'
        checked={form.enabled}
        onChange={(v) => set({ enabled: v })}
      />

      <div className="grid gap-1.5">
        <Label htmlFor="offer-badge-text">Badge text</Label>
        <Input
          id="offer-badge-text"
          value={form.badge_text}
          onChange={(e) => set({ badge_text: e.target.value })}
          placeholder="Mega Deal"
        />
      </div>

      <div className="grid gap-4 border-t border-border/60 pt-4">
        <p className="text-sm font-semibold">Which offers to show</p>
        <ToggleRow
          id="offer-show-online"
          label="Online payment discount"
          hint="Uses the % set in Online Payment Discount above (must be enabled there too)."
          checked={form.show_online_payment}
          onChange={(v) => set({ show_online_payment: v })}
        />
        <ToggleRow
          id="offer-show-coupons"
          label="Coupons"
          hint="Best eligible coupon is counted in the price; customers can apply any from the sheet."
          checked={form.show_coupons}
          onChange={(v) => set({ show_coupons: v })}
        />
        {form.show_coupons && (
          <div className="grid gap-2 rounded-md border border-border/60 bg-muted/30 p-3">
            <div className="flex gap-4 text-sm">
              <label className="flex items-center gap-1.5">
                <input
                  type="radio"
                  checked={form.coupon_mode === 'all'}
                  onChange={() => set({ coupon_mode: 'all' })}
                />
                All product-page coupons
              </label>
              <label className="flex items-center gap-1.5">
                <input
                  type="radio"
                  checked={form.coupon_mode === 'selected'}
                  onChange={() => set({ coupon_mode: 'selected' })}
                />
                Only selected
              </label>
            </div>
            {form.coupon_mode === 'selected' && (
              <div className="grid gap-1.5">
                {activeCoupons.length === 0 && (
                  <p className="text-xs text-muted-foreground">No active coupons found.</p>
                )}
                {activeCoupons.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={form.selected_coupon_codes.includes(c.code)}
                      onChange={(e) => toggleCode(c.code, e.target.checked)}
                    />
                    <span className="font-mono font-semibold">{c.code}</span>
                    <span className="text-xs text-muted-foreground">
                      {c.discount_type === 'percentage' ? `${c.discount_value}% off` : `₹${c.discount_value} off`}
                      {c.show_on_product_page ? '' : ' (not marked "show on product page")'}
                    </span>
                  </label>
                ))}
                <p className="text-xs text-muted-foreground">
                  Coupons must also be marked &quot;show on product page&quot; in the Coupons tab.
                </p>
              </div>
            )}
          </div>
        )}
        <ToggleRow
          id="offer-show-loyalty"
          label="Loyalty points (logged-in customers)"
          hint="Shown only if the customer has enough points to redeem."
          checked={form.show_loyalty}
          onChange={(v) => set({ show_loyalty: v })}
        />
        <ToggleRow
          id="offer-show-credit"
          label="Store credit (logged-in customers)"
          hint="Shown only if the customer has a store credit balance."
          checked={form.show_store_credit}
          onChange={(v) => set({ show_store_credit: v })}
        />
      </div>

      <Button type="button" onClick={save} disabled={saving} className="mt-2 w-fit bg-primary">
        {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
        {saving ? 'Saving…' : 'Save Offer Display'}
      </Button>
    </div>
  );
}
