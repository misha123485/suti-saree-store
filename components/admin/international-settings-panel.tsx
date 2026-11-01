'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  SUPPORTED_CURRENCIES,
  deleteShippingZone,
  fetchInternationalAdmin,
  formatMinor,
  normalizeExportDetails,
  normalizeInternationalCosts,
  normalizeInternationalSettings,
  previewInrToMinor,
  previewZoneShipping,
  saveInternationalSection,
  saveIntlCountries,
  saveShippingZone,
  type ExportDetails,
  type InternationalCosts,
  type InternationalSettings,
  type IntlCountry,
  type ShippingZone,
} from '@/lib/intl-api';

const selectCls = 'h-10 w-full rounded-md border border-input bg-background px-3 text-sm';
const cardCls = 'rounded-lg border border-border bg-card p-4';

type ZoneDraft = Omit<ShippingZone, 'id'> & { id?: string };

const blankZone = (): ZoneDraft => ({
  name: '',
  countries: [],
  base_rate_inr: 0,
  per_extra_500g_inr: 0,
  free_shipping_threshold_inr: 0,
  min_order_inr: 0,
  eta_min_days: null,
  eta_max_days: null,
  courier: '',
  is_active: false,
});

function numVal(v: string): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export default function InternationalSettingsPanel() {
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<InternationalSettings | null>(null);
  const [costs, setCosts] = useState<InternationalCosts | null>(null);
  const [exportDetails, setExportDetails] = useState<ExportDetails | null>(null);
  const [countries, setCountries] = useState<IntlCountry[]>([]);
  const [zones, setZones] = useState<ZoneDraft[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    try {
      const d = await fetchInternationalAdmin();
      setSettings(d.settings);
      setCosts(d.costs);
      setExportDetails(d.export_details);
      setCountries(d.countries);
      setZones(d.zones);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load international settings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const zonedCodes = useMemo(
    () => new Set(zones.filter((z) => z.is_active).flatMap((z) => z.countries)),
    [zones],
  );

  const run = async (key: string, fn: () => Promise<void>, okMsg: string) => {
    setBusy(key);
    try {
      await fn();
      toast.success(okMsg);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return (
      <p className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading international settings…
      </p>
    );
  }
  if (!settings || !costs || !exportDetails) {
    return (
      <p className="py-4 text-sm text-red-600">
        Could not load international settings. Make sure the Phase 1 SQL migration was run in Supabase.
      </p>
    );
  }

  const setS = (patch: Partial<InternationalSettings>) => setSettings({ ...settings, ...patch });
  const patchCountry = (code: string, patch: Partial<IntlCountry>) =>
    setCountries(countries.map((c) => (c.code === code ? { ...c, ...patch } : c)));
  const patchZone = (idx: number, patch: Partial<ZoneDraft>) =>
    setZones(zones.map((z, i) => (i === idx ? { ...z, ...patch } : z)));

  const saveSettings = () =>
    run('settings', async () => {
      const r = await saveInternationalSection('settings', settings);
      setSettings(normalizeInternationalSettings(r.value as InternationalSettings));
    }, 'International settings saved');

  const saveCosts = () =>
    run('costs', async () => {
      const r = await saveInternationalSection('costs', costs);
      setCosts(normalizeInternationalCosts(r.value as InternationalCosts));
    }, 'Cost settings saved');

  const saveExport = () =>
    run('export', async () => {
      const r = await saveInternationalSection('export_details', exportDetails);
      setExportDetails(normalizeExportDetails(r.value as ExportDetails));
    }, 'Export details saved');

  const saveCountries = () =>
    run('countries', async () => {
      const r = await saveIntlCountries(countries);
      setCountries(r.countries);
    }, 'Countries saved');

  const saveZone = (idx: number) =>
    run(`zone-${idx}`, async () => {
      const z = zones[idx];
      if (z.is_active && z.base_rate_inr === 0 && z.free_shipping_threshold_inr === 0) {
        if (!window.confirm('This zone is ACTIVE with a base shipping rate of ₹0. Customers will get free shipping. Continue?')) {
          throw new Error('Not saved');
        }
      }
      const r = await saveShippingZone({ ...z, name: z.name, courier: z.courier ?? '' });
      setZones(zones.map((x, i) => (i === idx ? r.zone : x)));
    }, 'Zone saved');

  const removeZone = (idx: number) => {
    const z = zones[idx];
    if (!z.id) {
      setZones(zones.filter((_, i) => i !== idx));
      return;
    }
    if (!window.confirm(`Delete zone "${z.name}"?`)) return;
    void run(`zone-del-${idx}`, async () => {
      await deleteShippingZone(z.id as string);
      setZones(zones.filter((_, i) => i !== idx));
    }, 'Zone deleted');
  };

  const sample = 5000;
  const previewCountry = countries.find((c) => c.is_enabled) ?? countries[0];

  return (
    <div className="space-y-6">
      <div className="rounded-md border border-amber-300/60 bg-amber-50 p-3 text-xs text-amber-900">
        <strong>UK:</strong> enable only after the UK VAT registration decision. Re-check duty/tax rules (especially
        US tariffs) with your courier&apos;s calculator before enabling any country. International orders are prepaid by
        card only (Stripe); India checkout is never affected.
      </div>

      {/* Master switch */}
      <div className={cardCls}>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="font-medium">International selling</p>
            <p className="text-xs text-muted-foreground">
              Master switch. OFF = the store behaves exactly as India-only. It can only be turned ON when at least one
              country is enabled AND covered by an active shipping zone.
            </p>
          </div>
          <Switch checked={settings.international_enabled} onCheckedChange={(v) => setS({ international_enabled: v })} />
        </div>
        <Button className="mt-3 bg-primary" disabled={busy === 'settings'} onClick={saveSettings}>
          <Save className="mr-1.5 h-4 w-4" /> {busy === 'settings' ? 'Saving…' : 'Save master switch & pricing below'}
        </Button>
      </div>

      {/* Countries */}
      <div className={cardCls}>
        <h3 className="font-medium">Countries</h3>
        <p className="mb-3 text-xs text-muted-foreground">
          Launch plan: Wave 1 = US, UAE, Malaysia. Wave 2 = Oman, Bahrain, Qatar, Saudi, Kuwait, Australia, Canada.
        </p>
        <div className="space-y-3">
          {countries.map((c) => {
            const noZone = c.is_enabled && !zonedCodes.has(c.code);
            return (
              <div key={c.code} className="rounded-md border border-border p-3">
                <div className="flex flex-wrap items-center gap-3">
                  <Switch checked={c.is_enabled} onCheckedChange={(v) => patchCountry(c.code, { is_enabled: v })} />
                  <span className="min-w-[10rem] font-medium">
                    {c.name} <span className="text-xs text-muted-foreground">({c.code})</span>
                  </span>
                  <select
                    className={`${selectCls} w-28`}
                    value={c.currency}
                    onChange={(e) => patchCountry(c.code, { currency: e.target.value })}
                  >
                    {SUPPORTED_CURRENCIES.map((cur) => (
                      <option key={cur} value={cur}>{cur}</option>
                    ))}
                  </select>
                  <label className="flex items-center gap-2 text-xs">
                    <Switch checked={c.requires_state} onCheckedChange={(v) => patchCountry(c.code, { requires_state: v })} />
                    State required
                  </label>
                  {noZone && (
                    <span className="rounded bg-red-100 px-2 py-0.5 text-xs text-red-700">No active shipping zone</span>
                  )}
                  {c.code === 'GB' && c.is_enabled && (
                    <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800">UK VAT decision needed</span>
                  )}
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-3">
                  <div>
                    <Label className="text-xs">Postal code pattern (regex, blank = free text)</Label>
                    <Input value={c.postal_regex ?? ''} onChange={(e) => patchCountry(c.code, { postal_regex: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-xs">Customer duty/VAT note (shown at checkout)</Label>
                    <Input value={c.vat_note ?? ''} onChange={(e) => patchCountry(c.code, { vat_note: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-xs">Internal notes</Label>
                    <Input value={c.notes ?? ''} onChange={(e) => patchCountry(c.code, { notes: e.target.value })} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <Button className="mt-3 bg-primary" disabled={busy === 'countries'} onClick={saveCountries}>
          <Save className="mr-1.5 h-4 w-4" /> {busy === 'countries' ? 'Saving…' : 'Save countries'}
        </Button>
      </div>

      {/* Zones */}
      <div className={cardCls}>
        <div className="flex items-center justify-between">
          <h3 className="font-medium">Shipping zones</h3>
          <Button variant="outline" size="sm" onClick={() => setZones([...zones, blankZone()])}>
            <Plus className="mr-1 h-4 w-4" /> Add zone
          </Button>
        </div>
        <p className="mb-3 text-xs text-muted-foreground">
          Enter your courier&apos;s real rates (₹). Shipping = base rate (first 500 g) + extra per further 500 g. A country
          can be in only one ACTIVE zone. Zones start inactive with ₹0 so nothing goes live until you fill them in.
        </p>
        <div className="space-y-4">
          {zones.map((z, idx) => (
            <div key={z.id ?? `new-${idx}`} className="rounded-md border border-border p-3">
              <div className="flex flex-wrap items-center gap-3">
                <Switch checked={z.is_active} onCheckedChange={(v) => patchZone(idx, { is_active: v })} />
                <span className="text-xs">{z.is_active ? 'Active' : 'Inactive'}</span>
                <Input className="max-w-xs" placeholder="Zone name" value={z.name} onChange={(e) => patchZone(idx, { name: e.target.value })} />
                <Input className="max-w-[12rem]" placeholder="Courier (DHL, FedEx…)" value={z.courier ?? ''} onChange={(e) => patchZone(idx, { courier: e.target.value })} />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {countries.map((c) => {
                  const on = z.countries.includes(c.code);
                  return (
                    <button
                      key={c.code}
                      type="button"
                      onClick={() =>
                        patchZone(idx, { countries: on ? z.countries.filter((x) => x !== c.code) : [...z.countries, c.code] })
                      }
                      className={`rounded-full border px-3 py-1 text-xs ${on ? 'border-primary bg-primary text-primary-foreground' : 'border-border'}`}
                    >
                      {c.code}
                    </button>
                  );
                })}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
                <div>
                  <Label className="text-xs">Base rate ₹ (first 500 g)</Label>
                  <Input type="number" min={0} value={z.base_rate_inr} onChange={(e) => patchZone(idx, { base_rate_inr: numVal(e.target.value) })} />
                </div>
                <div>
                  <Label className="text-xs">Extra ₹ per 500 g</Label>
                  <Input type="number" min={0} value={z.per_extra_500g_inr} onChange={(e) => patchZone(idx, { per_extra_500g_inr: numVal(e.target.value) })} />
                </div>
                <div>
                  <Label className="text-xs">Free shipping from ₹ (0 = never)</Label>
                  <Input type="number" min={0} value={z.free_shipping_threshold_inr} onChange={(e) => patchZone(idx, { free_shipping_threshold_inr: numVal(e.target.value) })} />
                </div>
                <div>
                  <Label className="text-xs">Minimum order ₹</Label>
                  <Input type="number" min={0} value={z.min_order_inr} onChange={(e) => patchZone(idx, { min_order_inr: numVal(e.target.value) })} />
                </div>
                <div>
                  <Label className="text-xs">Delivery min days</Label>
                  <Input type="number" min={1} value={z.eta_min_days ?? ''} onChange={(e) => patchZone(idx, { eta_min_days: e.target.value === '' ? null : numVal(e.target.value) })} />
                </div>
                <div>
                  <Label className="text-xs">Delivery max days</Label>
                  <Input type="number" min={1} value={z.eta_max_days ?? ''} onChange={(e) => patchZone(idx, { eta_max_days: e.target.value === '' ? null : numVal(e.target.value) })} />
                </div>
              </div>
              {z.id && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Example: 1 saree ({settings.default_item_weight_grams} g), items ₹{sample} → shipping ₹
                  {previewZoneShipping(z as ShippingZone, settings.default_item_weight_grams, sample)}
                </p>
              )}
              <div className="mt-3 flex gap-2">
                <Button size="sm" className="bg-primary" disabled={busy === `zone-${idx}`} onClick={() => void saveZone(idx)}>
                  <Save className="mr-1 h-4 w-4" /> {busy === `zone-${idx}` ? 'Saving…' : 'Save zone'}
                </Button>
                <Button size="sm" variant="outline" onClick={() => removeZone(idx)}>
                  <Trash2 className="mr-1 h-4 w-4" /> Delete
                </Button>
              </div>
            </div>
          ))}
          {zones.length === 0 && <p className="text-sm text-muted-foreground">No zones yet.</p>}
        </div>
      </div>

      {/* Pricing / FX */}
      <div className={cardCls}>
        <h3 className="font-medium">Currency, FX & policy</h3>
        <p className="mb-3 text-xs text-muted-foreground">
          Rates = INR for 1 unit of the currency. The customer is charged in their currency; Stripe settles to your
          bank in INR. Use the Save button below to store these.
        </p>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {SUPPORTED_CURRENCIES.map((cur) => (
            <div key={cur}>
              <Label className="text-xs">₹ per 1 {cur}</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={settings.fx_rates[cur] ?? ''}
                onChange={(e) => setS({ fx_rates: { ...settings.fx_rates, [cur]: numVal(e.target.value) } })}
              />
            </div>
          ))}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          <div>
            <Label className="text-xs">FX markup % (buffer)</Label>
            <Input type="number" min={0} step="0.1" value={settings.fx_markup_percent} onChange={(e) => setS({ fx_markup_percent: numVal(e.target.value) })} />
          </div>
          <div>
            <Label className="text-xs">Extra price markup %</Label>
            <Input type="number" min={0} step="0.1" value={settings.intl_price_markup_percent} onChange={(e) => setS({ intl_price_markup_percent: numVal(e.target.value) })} />
          </div>
          <div>
            <Label className="text-xs">Price rounding</Label>
            <select className={selectCls} value={settings.price_rounding} onChange={(e) => setS({ price_rounding: e.target.value as InternationalSettings['price_rounding'] })}>
              <option value="x.99">x.99 (e.g. $56.99)</option>
              <option value="x.00">Whole unit (e.g. $57.00)</option>
              <option value="none">Exact (no rounding)</option>
            </select>
          </div>
          <div>
            <Label className="text-xs">Duties & taxes</Label>
            <select className={selectCls} value={settings.default_duty_mode} onChange={(e) => setS({ default_duty_mode: e.target.value as 'DAP' | 'DDP' })}>
              <option value="DAP">DAP – buyer pays on delivery</option>
              <option value="DDP">DDP – we pay (included)</option>
            </select>
          </div>
          <div>
            <Label className="text-xs">International return window (days)</Label>
            <Input type="number" min={0} value={settings.return_window_days_intl} onChange={(e) => setS({ return_window_days_intl: numVal(e.target.value) })} />
          </div>
          <div>
            <Label className="text-xs">Default parcel weight per item (g)</Label>
            <Input type="number" min={50} value={settings.default_item_weight_grams} onChange={(e) => setS({ default_item_weight_grams: numVal(e.target.value) })} />
          </div>
        </div>
        {previewCountry && (
          <p className="mt-3 text-xs text-muted-foreground">
            Preview: ₹{sample} order → {formatMinor(previewInrToMinor(sample, previewCountry.currency, settings), previewCountry.currency)} ({previewCountry.name})
          </p>
        )}
        <Button className="mt-3 bg-primary" disabled={busy === 'settings'} onClick={saveSettings}>
          <Save className="mr-1.5 h-4 w-4" /> {busy === 'settings' ? 'Saving…' : 'Save pricing & policy'}
        </Button>
      </div>

      {/* Costs (admin only) */}
      <div className={cardCls}>
        <h3 className="font-medium">Payment costs (private)</h3>
        <p className="mb-3 text-xs text-muted-foreground">Used for the international profit & loss. Never shown to customers.</p>
        <div className="grid grid-cols-2 gap-3 md:max-w-md">
          <div>
            <Label className="text-xs">Stripe fee %</Label>
            <Input type="number" min={0} step="0.1" value={costs.stripe_fee_percent} onChange={(e) => setCosts({ ...costs, stripe_fee_percent: numVal(e.target.value) })} />
          </div>
          <div>
            <Label className="text-xs">Fixed fee per order ₹</Label>
            <Input type="number" min={0} value={costs.stripe_fixed_fee_inr} onChange={(e) => setCosts({ ...costs, stripe_fixed_fee_inr: numVal(e.target.value) })} />
          </div>
        </div>
        <Button className="mt-3 bg-primary" disabled={busy === 'costs'} onClick={saveCosts}>
          <Save className="mr-1.5 h-4 w-4" /> {busy === 'costs' ? 'Saving…' : 'Save costs'}
        </Button>
      </div>

      {/* Export details (admin only) */}
      <div className={cardCls}>
        <h3 className="font-medium">Export details (for the export invoice)</h3>
        <p className="mb-3 text-xs text-muted-foreground">Private. Confirm values with your CA (IEC, GSTIN, LUT, AD code, HS code).</p>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {(
            [
              ['iec', 'IEC'],
              ['gstin', 'GSTIN'],
              ['lut_number', 'LUT number'],
              ['lut_date', 'LUT date (YYYY-MM-DD)'],
              ['ad_code', 'AD code'],
              ['default_hs_code', 'Default HS code'],
            ] as const
          ).map(([key, label]) => (
            <div key={key}>
              <Label className="text-xs">{label}</Label>
              <Input value={exportDetails[key]} onChange={(e) => setExportDetails({ ...exportDetails, [key]: e.target.value })} />
            </div>
          ))}
        </div>
        <Button className="mt-3 bg-primary" disabled={busy === 'export'} onClick={saveExport}>
          <Save className="mr-1.5 h-4 w-4" /> {busy === 'export' ? 'Saving…' : 'Save export details'}
        </Button>
      </div>
    </div>
  );
}
