import { getServerSupabase } from '@/lib/supabase-server';

// ---------------------------------------------------------------------
// Product gallery overlays -- admin controlled (Admin > Settings >
// "Product Photo Overlays"). Each small label on top of the main product
// photo can be shown or hidden. All default to ON (= how the site looked
// before this setting existed), so nothing changes until the admin turns
// one off.
// ---------------------------------------------------------------------
export interface GalleryOverlaySettings {
  /** The "48% OFF" badge on the photo. */
  show_discount_badge: boolean;
  /** The "1 / 2" photo counter (mobile). */
  show_image_counter: boolean;
  /** The magnifier / "Click to zoom" button. */
  show_zoom_icon: boolean;
}

export const DEFAULT_GALLERY_OVERLAY_SETTINGS: GalleryOverlaySettings = {
  show_discount_badge: true,
  show_image_counter: true,
  show_zoom_icon: true,
};

export const GALLERY_OVERLAY_SETTINGS_KEY = 'gallery_overlays';

export function coerceGalleryOverlaySettings(
  value: Partial<GalleryOverlaySettings> | null | undefined
): GalleryOverlaySettings {
  const d = DEFAULT_GALLERY_OVERLAY_SETTINGS;
  if (!value) return { ...d };
  return {
    show_discount_badge: typeof value.show_discount_badge === 'boolean' ? value.show_discount_badge : d.show_discount_badge,
    show_image_counter: typeof value.show_image_counter === 'boolean' ? value.show_image_counter : d.show_image_counter,
    show_zoom_icon: typeof value.show_zoom_icon === 'boolean' ? value.show_zoom_icon : d.show_zoom_icon,
  };
}

/** Server-side read. Never throws: any failure = everything visible (old behaviour). */
export async function getGalleryOverlaySettingsServer(): Promise<GalleryOverlaySettings> {
  try {
    const supabase = getServerSupabase();
    const { data } = await supabase
      .from('settings')
      .select('value')
      .eq('key', GALLERY_OVERLAY_SETTINGS_KEY)
      .maybeSingle();
    return coerceGalleryOverlaySettings(data?.value as Partial<GalleryOverlaySettings> | undefined);
  } catch {
    return { ...DEFAULT_GALLERY_OVERLAY_SETTINGS };
  }
}
