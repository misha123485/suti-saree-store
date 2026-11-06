'use client';

import { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  GalleryDisplaySettings,
  DEFAULT_GALLERY_DISPLAY_SETTINGS,
  fetchGalleryDisplaySettings,
  saveGalleryDisplaySettings,
} from '@/lib/gallery-display-settings';

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

export default function GalleryDisplayPanel() {
  const [form, setForm] = useState<GalleryDisplaySettings | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchGalleryDisplaySettings(true)
      .then(setForm)
      .catch(() => {
        setForm(DEFAULT_GALLERY_DISPLAY_SETTINGS);
        toast.error('Failed to load photo overlay settings');
      });
  }, []);

  if (!form) return <p className="py-4 text-sm text-muted-foreground">Loading…</p>;

  const set = (patch: Partial<GalleryDisplaySettings>) => setForm((f) => (f ? { ...f, ...patch } : f));

  const save = async () => {
    setSaving(true);
    try {
      await saveGalleryDisplaySettings(form);
      toast.success('Photo overlay settings saved');
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : typeof err === 'object' && err !== null && 'message' in err
            ? String((err as { message?: unknown }).message)
            : 'Save failed'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-4 grid max-w-xl gap-4 rounded-lg border border-border/60 bg-card p-5">
      <ToggleRow
        id="gallery-show-discount"
        label='Show "% OFF" badge'
        hint="The discount badge in the top-left corner of the main product photo."
        checked={form.show_discount_badge}
        onChange={(v) => set({ show_discount_badge: v })}
      />
      <ToggleRow
        id="gallery-show-counter"
        label='Show photo counter ("1 / 2")'
        hint="The small photo number in the top-right corner (mobile)."
        checked={form.show_image_counter}
        onChange={(v) => set({ show_image_counter: v })}
      />
      <ToggleRow
        id="gallery-show-zoom"
        label="Show zoom button"
        hint="The magnifier button under the counter. Tapping the photo itself still opens the full-screen zoom."
        checked={form.show_zoom_button}
        onChange={(v) => set({ show_zoom_button: v })}
      />
      <Button type="button" onClick={save} disabled={saving} className="w-fit bg-primary">
        <Save className="mr-1.5 h-4 w-4" /> {saving ? 'Saving…' : 'Save'}
      </Button>
    </div>
  );
}
