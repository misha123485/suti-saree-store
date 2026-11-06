'use client';

import { useEffect, useState } from 'react';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface Flags {
  show_discount_badge: boolean;
  show_image_counter: boolean;
  show_zoom_icon: boolean;
}

const ROWS: { key: keyof Flags; label: string; hint: string }[] = [
  { key: 'show_discount_badge', label: 'Discount badge (e.g. "48% OFF")', hint: 'Top-left of the main product photo.' },
  { key: 'show_image_counter', label: 'Photo counter (e.g. "1 / 2")', hint: 'Top-right of the photo on mobile.' },
  { key: 'show_zoom_icon', label: 'Zoom (magnifier) icon', hint: 'The magnifier button on the photo. Tapping the photo itself still works.' },
];

export default function GalleryOverlaysCard() {
  const [flags, setFlags] = useState<Flags>({ show_discount_badge: true, show_image_counter: true, show_zoom_icon: true });
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch('/api/admin/gallery-overlays', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (alive && d) setFlags({ show_discount_badge: !!d.show_discount_badge, show_image_counter: !!d.show_image_counter, show_zoom_icon: !!d.show_zoom_icon });
      })
      .catch(() => {})
      .finally(() => alive && setLoaded(true));
    return () => {
      alive = false;
    };
  }, []);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/gallery-overlays', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(flags),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Save failed');
      toast.success('Saved. Product pages are refreshed.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-8">
      <h2 className="font-serif text-2xl font-bold text-primary">Product Photo Overlays</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Show or hide the small labels on top of the main product photo. All are ON by default.
      </p>
      <div className="mt-4 divide-y rounded-lg border bg-card">
        {ROWS.map((r) => (
          <div key={r.key} className="flex items-center justify-between gap-4 p-4">
            <div>
              <div className="text-sm font-medium">{r.label}</div>
              <div className="text-xs text-muted-foreground">{r.hint}</div>
            </div>
            <Switch
              checked={flags[r.key]}
              disabled={!loaded}
              onCheckedChange={(v) => setFlags((f) => ({ ...f, [r.key]: v }))}
            />
          </div>
        ))}
      </div>
      <Button type="button" className="mt-3" onClick={save} disabled={!loaded || saving}>
        {saving ? 'Saving…' : 'Save'}
      </Button>
    </div>
  );
}
