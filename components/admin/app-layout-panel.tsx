'use client';

import { useEffect, useState } from 'react';
import { Smartphone, Loader2, ArrowUp, ArrowDown, X, Plus } from 'lucide-react';
import { toast } from 'sonner';
import {
  HomeAppLayoutSettings,
  DEFAULT_HOME_APP_LAYOUT,
  fetchHomeAppLayoutAdmin,
  saveHomeAppLayout,
} from '@/lib/home-app-layout';
import { fetchCategories } from '@/lib/products-api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

interface Cat {
  id: string;
  name: string;
}

const TILE_COLORS = ['#FCE8DF', '#FDE7EC', '#FFF3D6', '#E6F2E8', '#E7EDFB', '#F1E8F8', '#FFFFFF'];

/** Admin > Marketing > App Layout — manages the app-style homepage top:
 *  scrollable primary category tabs + the 2/3-row category grid. */
export default function AppLayoutPanel() {
  const [s, setS] = useState<HomeAppLayoutSettings>(DEFAULT_HOME_APP_LAYOUT);
  const [cats, setCats] = useState<Cat[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [settings, catRes] = await Promise.all([
          fetchHomeAppLayoutAdmin(),
          fetchCategories().catch(() => []),
        ]);
        setS(settings);
        setCats(catRes.map((c) => ({ id: c.id, name: c.name })));
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to load');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const set = <K extends keyof HomeAppLayoutSettings>(k: K, v: HomeAppLayoutSettings[K]) =>
    setS((p) => ({ ...p, [k]: v }));

  const nameOf = (id: string) => cats.find((c) => c.id === id)?.name ?? '(deleted category)';

  const move = (i: number, d: -1 | 1) => {
    const a = [...s.primary_category_ids];
    const j = i + d;
    if (j < 0 || j >= a.length) return;
    [a[i], a[j]] = [a[j], a[i]];
    set('primary_category_ids', a);
  };

  const toggleHidden = (id: string) =>
    set(
      'hidden_category_ids',
      s.hidden_category_ids.includes(id)
        ? s.hidden_category_ids.filter((x) => x !== id)
        : [...s.hidden_category_ids, id]
    );

  const save = async () => {
    setSaving(true);
    try {
      await saveHomeAppLayout(s);
      toast.success('App Layout saved — homepage updated');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-primary/60" />
      </div>
    );
  }

  const available = cats.filter((c) => !s.primary_category_ids.includes(c.id));

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-2">
        <Smartphone className="h-5 w-5 text-primary" />
        <h2 className="font-serif text-xl font-bold">App Layout (Homepage top)</h2>
      </div>

      <section className="space-y-4 rounded-xl border bg-card p-4">
        <div className="flex items-center justify-between">
          <div>
            <Label className="font-semibold">Enable app-style layout</Label>
            <p className="text-xs text-muted-foreground">Off = purani circle wali “Shop by Category” row.</p>
          </div>
          <Switch checked={s.enabled} onCheckedChange={(v) => set('enabled', v)} />
        </div>
      </section>

      <section className="space-y-4 rounded-xl border bg-card p-4">
        <h3 className="font-semibold">Top scrollable bar (primary categories)</h3>
        <div className="flex items-center justify-between">
          <Label>Show “For You” (home) tab</Label>
          <Switch checked={s.show_for_you_tab} onCheckedChange={(v) => set('show_for_you_tab', v)} />
        </div>
        <div className="max-w-xs space-y-1">
          <Label>“For You” tab name</Label>
          <Input value={s.for_you_label} maxLength={20} onChange={(e) => set('for_you_label', e.target.value)} />
        </div>

        <p className="text-xs text-muted-foreground">
          Jo categories yahan add karoge wahi top bar me us order me dikhengi. Khali chhodo to pehli 8 categories auto dikhengi.
        </p>
        <ul className="space-y-1.5">
          {s.primary_category_ids.map((id, i) => (
            <li key={id} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
              <span className="flex-1">{nameOf(id)}</span>
              <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={() => move(i, -1)} disabled={i === 0}>
                <ArrowUp className="h-4 w-4" />
              </Button>
              <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={() => move(i, 1)} disabled={i === s.primary_category_ids.length - 1}>
                <ArrowDown className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={() => set('primary_category_ids', s.primary_category_ids.filter((x) => x !== id))}
              >
                <X className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
        {available.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {available.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => set('primary_category_ids', [...s.primary_category_ids, c.id])}
                className="inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs hover:border-primary hover:text-primary"
              >
                <Plus className="h-3 w-3" /> {c.name}
              </button>
            ))}
          </div>
        )}
        <div className="flex items-center gap-3">
          <Label>Bar background</Label>
          <input
            type="color"
            value={s.bar_bg || '#ffffff'}
            onChange={(e) => set('bar_bg', e.target.value)}
            className="h-8 w-12 cursor-pointer rounded border"
          />
          <Button type="button" variant="ghost" size="sm" onClick={() => set('bar_bg', '')}>
            Reset to theme
          </Button>
        </div>
      </section>

      <section className="space-y-4 rounded-xl border bg-card p-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">All categories grid (banner ke niche)</h3>
          <Switch checked={s.show_grid} onCheckedChange={(v) => set('show_grid', v)} />
        </div>
        <div className="max-w-xs space-y-1">
          <Label>Section title (khali = no title)</Label>
          <Input value={s.grid_title} maxLength={60} onChange={(e) => set('grid_title', e.target.value)} />
        </div>
        <div className="flex flex-wrap gap-6">
          <div className="space-y-1">
            <Label>Rows</Label>
            <div className="flex gap-2">
              {([2, 3] as const).map((n) => (
                <Button key={n} type="button" size="sm" variant={s.grid_rows === n ? 'default' : 'outline'} onClick={() => set('grid_rows', n)}>
                  {n} rows
                </Button>
              ))}
            </div>
          </div>
          <div className="space-y-1">
            <Label>Tile shape</Label>
            <div className="flex gap-2">
              {(['rounded', 'circle'] as const).map((n) => (
                <Button key={n} type="button" size="sm" variant={s.tile_shape === n ? 'default' : 'outline'} onClick={() => set('tile_shape', n)}>
                  {n === 'rounded' ? 'Rounded box' : 'Circle'}
                </Button>
              ))}
            </div>
          </div>
        </div>
        <div className="space-y-1">
          <Label>Tile background</Label>
          <div className="flex flex-wrap items-center gap-2">
            {TILE_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={c}
                onClick={() => set('tile_bg', c)}
                className={`h-8 w-8 rounded-full border-2 ${s.tile_bg.toLowerCase() === c.toLowerCase() ? 'border-primary' : 'border-border'}`}
                style={{ backgroundColor: c }}
              />
            ))}
            <input type="color" value={s.tile_bg} onChange={(e) => set('tile_bg', e.target.value)} className="h-8 w-12 cursor-pointer rounded border" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Grid me kaunsi categories chhupani hain</Label>
          <div className="flex flex-wrap gap-2">
            {cats.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => toggleHidden(c.id)}
                className={`rounded-full border px-3 py-1 text-xs ${
                  s.hidden_category_ids.includes(c.id) ? 'border-destructive bg-destructive/10 text-destructive line-through' : 'hover:border-primary'
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>
      </section>

      <Button onClick={save} disabled={saving} className="w-full sm:w-auto">
        {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save changes
      </Button>
    </div>
  );
}
