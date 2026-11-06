import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/admin-fulfillment-shared';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import {
  GALLERY_OVERLAY_SETTINGS_KEY,
  coerceGalleryOverlaySettings,
  type GalleryOverlaySettings,
} from '@/lib/gallery-overlay-settings';

// GET  /api/admin/gallery-overlays -> current { show_discount_badge, show_image_counter, show_zoom_icon }
// POST /api/admin/gallery-overlays -> saves the three flags and refreshes product pages

export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const admin = getSupabaseAdmin();
  const { data } = await admin.from('settings').select('value').eq('key', GALLERY_OVERLAY_SETTINGS_KEY).maybeSingle();
  return NextResponse.json(coerceGalleryOverlaySettings(data?.value as Partial<GalleryOverlaySettings> | undefined));
}

export async function POST(req: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  let body: Partial<GalleryOverlaySettings>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const keys: (keyof GalleryOverlaySettings)[] = ['show_discount_badge', 'show_image_counter', 'show_zoom_icon'];
  for (const k of keys) {
    if (typeof body[k] !== 'boolean') {
      return NextResponse.json({ error: `"${k}" must be a boolean` }, { status: 400 });
    }
  }
  const settings = coerceGalleryOverlaySettings(body);

  const admin = getSupabaseAdmin();
  const { error } = await admin
    .from('settings')
    .upsert({ key: GALLERY_OVERLAY_SETTINGS_KEY, value: settings }, { onConflict: 'key' });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Product pages are cached (ISR); refresh them so the change shows up now.
  try {
    revalidatePath('/product/[slug]', 'page');
  } catch {
    /* non-fatal */
  }
  return NextResponse.json({ saved: true, ...settings });
}
