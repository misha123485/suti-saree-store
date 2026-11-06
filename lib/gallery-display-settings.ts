import { supabase } from './supabase';

// ---------------------------------------------------------------------
// Product-page photo overlays -- admin controlled.
// Stored under the 'product_gallery_display' settings key. Everything
// defaults to ON, so the storefront looks exactly as before until the
// admin switches something off in Admin > Settings.
// ---------------------------------------------------------------------
export interface GalleryDisplaySettings {
  /** "48% OFF" badge on the main product photo. */
  show_discount_badge: boolean;
  /** "1 / 2" photo counter on the main product photo (mobile). */
  show_image_counter: boolean;
  /** Magnifier / "Click to zoom" button on the main product photo. */
  show_zoom_button: boolean;
}

export const DEFAULT_GALLERY_DISPLAY_SETTINGS: GalleryDisplaySettings = {
  show_discount_badge: true,
  show_image_counter: true,
  show_zoom_button: true,
};

// One shared request per page load, so every gallery on the page (and
// colour swaps) reuse the same answer instead of re-querying.
let cached: GalleryDisplaySettings | null = null;
let inflight: Promise<GalleryDisplaySettings> | null = null;

export function getCachedGalleryDisplaySettings(): GalleryDisplaySettings | null {
  return cached;
}

export async function fetchGalleryDisplaySettings(force = false): Promise<GalleryDisplaySettings> {
  if (!force && cached) return cached;
  if (!force && inflight) return inflight;
  inflight = (async () => {
    const { data, error } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'product_gallery_display')
      .maybeSingle();
    const result =
      error || !data
        ? DEFAULT_GALLERY_DISPLAY_SETTINGS
        : { ...DEFAULT_GALLERY_DISPLAY_SETTINGS, ...(data.value as Partial<GalleryDisplaySettings>) };
    // Only remember a real answer; a failed request is retried next time.
    if (!error) cached = result;
    inflight = null;
    return result;
  })();
  return inflight;
}

export async function saveGalleryDisplaySettings(settings: GalleryDisplaySettings) {
  const { error } = await supabase
    .from('settings')
    .upsert({ key: 'product_gallery_display', value: settings }, { onConflict: 'key' });
  if (error) throw error;
  cached = settings;
}
