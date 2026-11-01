'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Download, Loader2, RefreshCw, Save } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { fetchInternationalAdmin, saveInternationalSection, formatMinor, type InternationalAdminData } from '@/lib/intl-api';
import { computeBreakEven, type PnlRow, type PnlTotals } from '@/lib/intl-pnl';

const inr = (n: number) => '₹' + (n ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const istToday = () => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
const istMonthStart = () => istToday().slice(0, 8) + '01';

interface PnlResponse { from: string; to: string; rows: PnlRow[]; totals: PnlTotals; byCountry: Array<{ country: string; totals: PnlTotals }> }
interface CostProduct { id: string; name: string; price: number; cost_inr: number | null }

const th = 'px-3 py-2 text-left text-xs font-medium text-muted-foreground whitespace-nowrap';
const td = 'px-3 py-2 text-sm whitespace-nowrap';
const num = 'px-3 py-2 text-sm text-right tabular-nums whitespace-nowrap';

function Card({ label, value, sub, bad }: { label: string; value: string; sub?: string; bad?: boolean }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 text-xl font-semibold tabular-nums ${bad ? 'text-red-600' : ''}`}>{value}</p>
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border bg-card">
      <div className="border-b px-4 py-3">
        <h3 className="text-sm font-semibold">{title}</h3>
        {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

/** One editable number cell (settlement / ad spend). Saves on blur or Enter. */
function EditCell({ value, placeholder, onSave }: { value: number | null; placeholder?: string; onSave: (v: string) => Promise<void> }) {
  const [v, setV] = useState(value == null ? '' : String(value));
  const [busy, setBusy] = useState(false);
  useEffect(() => setV(value == null ? '' : String(value)), [value]);
  const commit = async () => {
    if (v === (value == null ? '' : String(value))) return;
    setBusy(true);
    try { await onSave(v); } finally { setBusy(false); }
  };
  return (
    <Input
      className="h-8 w-24 text-right tabular-nums"
      inputMode="numeric"
      value={v}
      placeholder={placeholder}
      disabled={busy}
      onChange={(e) => setV(e.target.value.replace(/[^\d]/g, ''))}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
    />
  );
}

export default function InternationalPnlPanel() {
  const [cfg, setCfg] = useState<InternationalAdminData | null>(null);
  const [from, setFrom] = useState(istMonthStart());
  const [to, setTo] = useState(istToday());
  const [country, setCountry] = useState('');
  const [data, setData] = useState<PnlResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const qs = new URLSearchParams({ from, to, ...(country ? { country } : {}) });
      const res = await fetch(`/api/admin/international/pnl?${qs}`, { cache: 'no-store' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'P&L load nahi hua');
      setData(body);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'P&L load nahi hua');
    } finally {
      setLoading(false);
    }
  }, [from, to, country]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { fetchInternationalAdmin().then(setCfg).catch((e) => toast.error(e.message)); }, []);

  const saveOrderField = async (orderId: string, patch: Record<string, unknown>) => {
    const res = await fetch('/api/admin/international/pnl', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderId, ...patch }) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { toast.error(body.error || 'Save nahi hua'); return; }
    toast.success('Saved');
    load();
  };

  const t = data?.totals;
  const countries = cfg?.countries ?? [];

  return (
    <div className="grid gap-5 [&>*]:min-w-0">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-muted-foreground">From<Input type="date" className="mt-1 h-9 w-40" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="text-xs text-muted-foreground">To<Input type="date" className="mt-1 h-9 w-40" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <label className="text-xs text-muted-foreground">Country
          <select className="mt-1 h-9 w-44 rounded-md border bg-background px-2 text-sm" value={country} onChange={(e) => setCountry(e.target.value)}>
            <option value="">All countries</option>
            {countries.map((c) => <option key={c.code} value={c.code}>{c.name} ({c.code})</option>)}
          </select>
        </label>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>{loading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}Refresh</Button>
        <Button variant="outline" size="sm" asChild>
          <a href={`/api/admin/international/pnl?${new URLSearchParams({ from, to, format: 'csv', ...(country ? { country } : {}) })}`}><Download className="mr-1.5 h-3.5 w-3.5" />CSV</a>
        </Button>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {t && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <Card label="Orders" value={String(t.orders)} sub={`${t.loss_orders} loss-making`} bad={t.loss_orders > 0} />
            <Card label="Revenue (INR)" value={inr(t.revenue)} />
            <Card label="Net profit (INR)" value={inr(t.profit)} bad={t.profit < 0} />
            <Card label="Margin" value={`${t.margin_percent}%`} bad={t.margin_percent < 0} />
            <Card label="Return / chargeback rate" value={`${t.return_chargeback_rate}%`} sub={`Refunds ${inr(t.refunds)} · Chargebacks ${inr(t.chargeback)}`} />
          </div>
          {t.cost_missing_orders > 0 && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              {t.cost_missing_orders} order(s) have products with no cost saved, so their profit is OVERSTATED. Fill the costs in &quot;Product costs&quot; below (or set a fallback cost %).
            </div>
          )}

          <Section title="By country">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead><tr><th className={th}>Country</th><th className={th}>Orders</th><th className={th}>Revenue</th><th className={th}>Profit</th><th className={th}>Margin</th></tr></thead>
                <tbody>
                  {data.byCountry.map((c) => (
                    <tr key={c.country} className="border-t">
                      <td className={td}>{c.country}</td><td className={num}>{c.totals.orders}</td><td className={num}>{inr(c.totals.revenue)}</td>
                      <td className={`${num} ${c.totals.profit < 0 ? 'text-red-600' : ''}`}>{inr(c.totals.profit)}</td><td className={num}>{c.totals.margin_percent}%</td>
                    </tr>
                  ))}
                  {data.byCountry.length === 0 && <tr><td className={td} colSpan={5}>No international orders in this range.</td></tr>}
                </tbody>
              </table>
            </div>
          </Section>

          <Section title="Orders" hint="Red = loss-making. Courier cost and DDP duty come from the Admin > Orders > International shipment form. Settlement = net INR Stripe actually paid out for that order (replaces the estimated Stripe fee + FX loss). Ad spend = optional amount you allocate to the order.">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    {['Order', 'Date', 'Country', 'Charged', 'Revenue', 'Stripe+FX', 'Product cost', 'Packing', 'Courier', 'Duty', 'Refunds', 'Chargeback', 'Profit', 'Margin', 'Settlement ₹', 'Ad spend ₹'].map((h) => <th key={h} className={th}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r) => (
                    <tr key={r.id} className={`border-t ${r.profit < 0 ? 'bg-red-50 text-red-700' : ''}`}>
                      <td className={td}>#{r.order_number}{r.flags.disputed && <span className="ml-1 rounded bg-red-100 px-1 text-[10px] text-red-700">dispute</span>}</td>
                      <td className={td}>{r.created_at.slice(0, 10)}</td>
                      <td className={td}>{r.country}</td>
                      <td className={num}>{formatMinor(Math.round(r.charge_major * (['OMR', 'BHD', 'KWD'].includes(r.currency) ? 1000 : 100)), r.currency)}</td>
                      <td className={num}>{inr(r.revenue)}</td>
                      <td className={num}>{inr(r.fees + r.fx_loss)}</td>
                      <td className={num} title={r.flags.cost_missing ? 'Cost missing for some items' : ''}>{inr(r.cogs)}{r.flags.cost_missing && ' ⚠'}</td>
                      <td className={num}>{inr(r.packaging)}</td>
                      <td className={num} title={r.flags.courier_estimated ? 'Estimated from zone rate (no actual cost entered)' : ''}>{inr(r.courier)}{r.flags.courier_estimated && ' ~'}</td>
                      <td className={num}>{inr(r.duty)}</td>
                      <td className={num}>{inr(r.refunds)}</td>
                      <td className={num}>{inr(r.chargeback)}</td>
                      <td className={`${num} font-semibold`}>{inr(r.profit)}</td>
                      <td className={num}>{r.margin_percent}%</td>
                      <td className={td}><EditCell value={r.actual_settlement_inr} placeholder="auto" onSave={(v) => saveOrderField(r.id, { actual_settlement_inr: v === '' ? null : Number(v) })} /></td>
                      <td className={td}><EditCell value={r.intl_ad_spend_inr || null} placeholder="0" onSave={(v) => saveOrderField(r.id, { intl_ad_spend_inr: v === '' ? 0 : Number(v) })} /></td>
                    </tr>
                  ))}
                  {data.rows.length > 0 && (
                    <tr className="border-t-2 bg-muted/40 font-semibold">
                      <td className={td} colSpan={4}>Total</td>
                      <td className={num}>{inr(t.revenue)}</td><td className={num}>{inr(t.fees + t.fx_loss)}</td><td className={num}>{inr(t.cogs)}</td>
                      <td className={num}>{inr(t.packaging)}</td><td className={num}>{inr(t.courier)}</td><td className={num}>{inr(t.duty)}</td>
                      <td className={num}>{inr(t.refunds)}</td><td className={num}>{inr(t.chargeback)}</td><td className={num}>{inr(t.profit)}</td>
                      <td className={num}>{t.margin_percent}%</td><td className={td} colSpan={2}>Ad spend {inr(t.ad_spend)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Section>
        </>
      )}

      {cfg && <Assumptions cfg={cfg} onSaved={(c) => { setCfg({ ...cfg, costs: c }); load(); }} />}
      <ProductCosts onChanged={load} />
      {cfg && <BreakEven cfg={cfg} />}
    </div>
  );
}

function Assumptions({ cfg, onSaved }: { cfg: InternationalAdminData; onSaved: (c: InternationalAdminData['costs']) => void }) {
  const [c, setC] = useState(cfg.costs);
  const [saving, setSaving] = useState(false);
  const field = (k: keyof typeof c, label: string, hint: string) => (
    <label className="text-xs text-muted-foreground">{label}
      <Input className="mt-1 h-9 w-40" type="number" min={0} step="any" value={c[k]} onChange={(e) => setC({ ...c, [k]: Number(e.target.value) })} />
      <span className="mt-0.5 block text-[11px]">{hint}</span>
    </label>
  );
  const save = async () => {
    setSaving(true);
    try { const r = await saveInternationalSection('costs', c); onSaved(r.value as typeof c); toast.success('Assumptions saved'); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Save nahi hua'); }
    finally { setSaving(false); }
  };
  return (
    <Section title="P&L assumptions" hint="Used when an order has no actual figure. Stripe fee % and fixed fee are the same values as Settings > International.">
      <div className="flex flex-wrap items-start gap-4">
        {field('stripe_fee_percent', 'Stripe fee %', 'of revenue')}
        {field('stripe_fixed_fee_inr', 'Stripe fixed fee ₹', 'per order')}
        {field('dispute_fee_inr', 'Chargeback fee ₹', 'per lost dispute')}
        {field('fallback_cogs_percent', 'Fallback cost %', 'of price, if no cost saved (0 = flag as missing)')}
        <Button size="sm" className="mt-5" onClick={save} disabled={saving}>{saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />}Save</Button>
      </div>
    </Section>
  );
}

function ProductCosts({ onChanged }: { onChanged: () => void }) {
  const [q, setQ] = useState('');
  const [items, setItems] = useState<CostProduct[]>([]);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const search = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/international/product-costs?q=${encodeURIComponent(q)}`, { cache: 'no-store' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Load nahi hua');
      setItems(body.products); setEdits({});
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Load nahi hua'); }
    finally { setBusy(false); }
  }, [q]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { search(); }, []);

  const save = async () => {
    const costs = Object.entries(edits).map(([product_id, v]) => ({ product_id, cost_inr: v === '' ? null : Number(v) }));
    if (!costs.length) return;
    setBusy(true);
    try {
      const res = await fetch('/api/admin/international/product-costs', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ costs }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Save nahi hua');
      toast.success(`${body.saved} saved, ${body.removed} removed`);
      await search(); onChanged();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Save nahi hua'); }
    finally { setBusy(false); }
  };

  return (
    <Section title="Product costs" hint="What each product costs YOU (INR). Stored server-side, admin-only — never shown to customers. The product form's Safe Profit cost is only kept in your browser, so enter the real costs here once.">
      <div className="mb-3 flex gap-2">
        <Input className="h-9 max-w-xs" placeholder="Search product name" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') search(); }} />
        <Button variant="outline" size="sm" onClick={search} disabled={busy}>Search</Button>
        <Button size="sm" onClick={save} disabled={busy || !Object.keys(edits).length}>{busy && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}Save {Object.keys(edits).length || ''} change(s)</Button>
      </div>
      <div className="max-h-80 overflow-auto">
        <table className="w-full">
          <thead><tr><th className={th}>Product</th><th className={th}>Price ₹</th><th className={th}>Your cost ₹</th></tr></thead>
          <tbody>
            {items.map((p) => (
              <tr key={p.id} className="border-t">
                <td className={`${td} max-w-xs truncate`}>{p.name}</td>
                <td className={num}>{p.price}</td>
                <td className={td}>
                  <Input className="h-8 w-28 text-right tabular-nums" inputMode="decimal" placeholder="—" value={edits[p.id] ?? (p.cost_inr == null ? '' : String(p.cost_inr))}
                    onChange={(e) => setEdits({ ...edits, [p.id]: e.target.value.replace(/[^\d.]/g, '') })} />
                </td>
              </tr>
            ))}
            {items.length === 0 && <tr><td className={td} colSpan={3}>No products found.</td></tr>}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

function BreakEven({ cfg }: { cfg: InternationalAdminData }) {
  const zones = useMemo(() => cfg.zones.filter((z) => z.countries.length), [cfg.zones]);
  const enabled = useMemo(() => cfg.countries.filter((c) => zones.some((z) => z.countries.includes(c.code))), [cfg.countries, zones]);
  const [code, setCode] = useState(enabled[0]?.code ?? '');
  const [price, setPrice] = useState('3000');
  const [cost, setCost] = useState('1500');
  const [courier, setCourier] = useState('');
  const [duty, setDuty] = useState('0');
  const country = enabled.find((c) => c.code === code) ?? enabled[0];
  const zone = country ? zones.find((z) => z.countries.includes(country.code)) : undefined;
  const packaging = 0;
  const res = useMemo(() => {
    if (!country || !zone) return null;
    return computeBreakEven({
      zone, currency: country.currency, priceInr: Number(price) || 0, costInr: Number(cost) || 0,
      courierCostInr: courier === '' ? zone.base_rate_inr : Number(courier) || 0,
      packagingInr: packaging, dutyInr: Number(duty) || 0, weightGrams: cfg.settings.default_item_weight_grams,
      settings: cfg.settings, costs: cfg.costs,
    });
  }, [country, zone, price, cost, courier, duty, cfg.settings, cfg.costs]);

  return (
    <Section title="Break-even helper" hint="Check a country before (or after) enabling it. Packaging is not included here — it is taken from Settings > Shipping 'other charges' in the real P&L.">
      {!country || !zone ? (
        <p className="text-sm text-muted-foreground">Enable a country and an active shipping zone first (Settings &gt; International Selling).</p>
      ) : (
        <div className="grid gap-4">
          <div className="flex flex-wrap items-start gap-4">
            <label className="text-xs text-muted-foreground">Country
              <select className="mt-1 h-9 w-44 rounded-md border bg-background px-2 text-sm" value={country.code} onChange={(e) => setCode(e.target.value)}>
                {enabled.map((c) => <option key={c.code} value={c.code}>{c.name} ({c.currency})</option>)}
              </select>
            </label>
            <label className="text-xs text-muted-foreground">Selling price ₹<Input className="mt-1 h-9 w-32" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d]/g, ''))} /></label>
            <label className="text-xs text-muted-foreground">Your cost ₹<Input className="mt-1 h-9 w-32" inputMode="numeric" value={cost} onChange={(e) => setCost(e.target.value.replace(/[^\d]/g, ''))} /></label>
            <label className="text-xs text-muted-foreground">Courier bills you ₹<Input className="mt-1 h-9 w-36" inputMode="numeric" placeholder={`zone rate ${zone.base_rate_inr}`} value={courier} onChange={(e) => setCourier(e.target.value.replace(/[^\d]/g, ''))} /></label>
            <label className="text-xs text-muted-foreground">Duty you absorb ₹ (DDP)<Input className="mt-1 h-9 w-36" inputMode="numeric" value={duty} onChange={(e) => setDuty(e.target.value.replace(/[^\d]/g, ''))} /></label>
          </div>
          {res && (
            <>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                <Card label="Customer pays" value={formatMinor(res.customerPaysMinor, country.currency)} sub={`incl. shipping ${inr(res.shippingChargedInr)}`} />
                <Card label="Revenue (INR)" value={inr(res.revenueInr)} />
                <Card label="Stripe + FX" value={inr(res.feesInr + res.fxLossInr)} />
                <Card label="Profit" value={inr(res.profitInr)} bad={res.profitInr < 0} />
                <Card label="Margin" value={`${res.marginPercent}%`} bad={res.marginPercent < 0} />
              </div>
              <p className="text-sm">
                {res.minOrderInr === 0
                  ? 'The shipping fee already covers your courier and fixed costs, so every order breaks even at this cost-to-price ratio.'
                  : res.minOrderInr == null
                  ? 'At this cost-to-price ratio the order never breaks even (fees + FX are bigger than your margin). Raise the price or the international markup.'
                  : <>Minimum order value to break even: <b>{inr(res.minOrderInr)}</b> (same cost-to-price ratio, shipping fee as per zone).</>}
              </p>
              {res.zoneBelowBreakEven && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  Zone &quot;{zone.name}&quot; minimum order is {inr(res.zoneMinOrderInr)}, which is BELOW the break-even of {inr(res.minOrderInr ?? 0)}. Orders between the two will lose money — raise min_order_inr.
                </div>
              )}
            </>
          )}
        </div>
      )}
    </Section>
  );
}
