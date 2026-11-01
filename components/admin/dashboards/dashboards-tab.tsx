'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, RefreshCw, Settings2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DASHBOARD_IDS, DASHBOARD_META, DEFAULT_DASHBOARD_SETTINGS, DashboardSettings, DashboardsResponse,
} from '@/lib/dashboards-config';
import { KpiDashboard, LiveDashboard, MarketingDashboard, StoreDashboard } from './dashboards';

function SettingsPanel({
  initial,
  onClose,
  onSaved,
}: {
  initial: DashboardSettings;
  onClose: () => void;
  onSaved: (s: DashboardSettings) => void;
}) {
  const [draft, setDraft] = useState<DashboardSettings>(initial);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/dashboards', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: draft }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Save nahi hua');
      toast.success('Dashboard settings save ho gayi');
      onSaved(body.settings);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save nahi hua');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mb-4 rounded-xl border border-border/60 bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-serif text-lg font-semibold text-primary">Dashboard settings</h3>
        <button onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-accent" aria-label="Close"><X className="h-4 w-4" /></button>
      </div>

      <ul className="divide-y divide-border/50">
        {DASHBOARD_IDS.map((id) => (
          <li key={id} className="flex items-center justify-between gap-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-medium">{DASHBOARD_META[id].title}</p>
              <p className="text-xs text-muted-foreground">{DASHBOARD_META[id].description}</p>
            </div>
            <Switch
              checked={draft.enabled[id]}
              onCheckedChange={(v) => setDraft((d) => ({ ...d, enabled: { ...d.enabled, [id]: v } }))}
              aria-label={`${DASHBOARD_META[id].title} on/off`}
            />
          </li>
        ))}
      </ul>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-muted-foreground">
          Auto refresh
          <select
            value={draft.refreshSeconds}
            onChange={(e) => setDraft((d) => ({ ...d, refreshSeconds: Number(e.target.value) as DashboardSettings['refreshSeconds'] }))}
            className="mt-1 block w-full rounded-md border border-border bg-background px-2 py-2 text-sm text-foreground"
          >
            <option value={0}>Off (manual refresh) - quota ke liye best</option>
            <option value={300}>Har 5 minute</option>
            <option value={120}>Har 2 minute</option>
            <option value={60}>Har 1 minute (sale day)</option>
          </select>
        </label>
        <label className="text-xs text-muted-foreground">
          Daily sales target (₹) - Live Sale Monitor ke liye
          <input
            type="number"
            min={1}
            value={draft.dailySalesTarget}
            onChange={(e) => setDraft((d) => ({ ...d, dailySalesTarget: Number(e.target.value) }))}
            className="mt-1 block w-full rounded-md border border-border bg-background px-2 py-2 text-sm text-foreground"
          />
        </label>
      </div>

      <p className="mt-3 text-[11px] text-muted-foreground">
        Sirf ON kiye hue dashboards ka data load hota hai, aur server 30 second tak result cache karta hai, isliye Supabase free quota bachta hai.
      </p>

      <div className="mt-3 flex justify-end gap-2">
        <button onClick={onClose} className="rounded-md border border-border/60 px-3 py-1.5 text-sm hover:bg-accent">Cancel</button>
        <button onClick={save} disabled={saving} className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-60">
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Save
        </button>
      </div>
    </div>
  );
}

export default function DashboardsTab() {
  const [res, setRes] = useState<DashboardsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const inFlight = useRef(false);

  const load = useCallback(async (silent = false) => {
    if (inFlight.current) return;
    inFlight.current = true;
    silent ? setRefreshing(true) : setLoading(true);
    try {
      const r = await fetch('/api/admin/dashboards', { cache: 'no-store' });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body.error || 'Dashboards load nahi hue');
      setRes(body);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Dashboards load nahi hue');
    } finally {
      inFlight.current = false;
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Optional auto refresh -- paused while the browser tab is hidden so a
  // forgotten open tab never burns quota in the background.
  const seconds = res?.settings.refreshSeconds ?? 0;
  useEffect(() => {
    if (!seconds) return;
    const t = setInterval(() => { if (document.visibilityState === 'visible') load(true); }, seconds * 1000);
    return () => clearInterval(t);
  }, [seconds, load]);

  const settings = res?.settings ?? DEFAULT_DASHBOARD_SETTINGS;
  const time = res ? new Date(res.generatedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '';
  const activeIds = DASHBOARD_IDS.filter((id) => settings.enabled[id]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {activeIds.length} dashboard{activeIds.length === 1 ? '' : 's'} ON{time && ` · updated ${time}`}
        </p>
        <div className="flex gap-2">
          <button onClick={() => load(true)} disabled={refreshing || loading} className="flex items-center gap-1.5 rounded-md border border-border/60 px-3 py-1.5 text-sm hover:bg-accent disabled:opacity-60">
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
          </button>
          <button onClick={() => setShowSettings((v) => !v)} className="flex items-center gap-1.5 rounded-md border border-border/60 px-3 py-1.5 text-sm hover:bg-accent">
            <Settings2 className="h-3.5 w-3.5" /> Choose dashboards
          </button>
        </div>
      </div>

      {showSettings && (
        <SettingsPanel
          initial={settings}
          onClose={() => setShowSettings(false)}
          onSaved={() => { setShowSettings(false); load(); }}
        />
      )}

      {loading ? (
        <div className="grid gap-4"><Skeleton className="h-72 rounded-2xl" /><Skeleton className="h-72 rounded-2xl" /></div>
      ) : activeIds.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Koi dashboard ON nahi hai. <button className="font-medium text-primary underline" onClick={() => setShowSettings(true)}>Choose dashboards</button> se ON karein.
        </div>
      ) : (
        <div className="grid gap-5 [&>*]:min-w-0">
          {activeIds.map((id) => {
            const err = res?.errors?.[id];
            if (err) return <div key={id} className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{DASHBOARD_META[id].title}: {err}</div>;
            if (id === 'kpi' && res?.data.kpi) return <KpiDashboard key={id} d={res.data.kpi} time={time} />;
            if (id === 'store' && res?.data.store) return <StoreDashboard key={id} d={res.data.store} time={time} />;
            if (id === 'marketing' && res?.data.marketing) return <MarketingDashboard key={id} d={res.data.marketing} time={time} />;
            if (id === 'live' && res?.data.live) return <LiveDashboard key={id} d={res.data.live} time={time} />;
            return null;
          })}
        </div>
      )}
    </div>
  );
}
