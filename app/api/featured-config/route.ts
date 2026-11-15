// Public, halka endpoint: storefront ye puchta hai ki kaun si jagah par
// "Trending Now" strip dikhani hai (admin ke toggles). Vercel CDN 60s cache karta hai.
// Koi bhi error ho to sab OFF return hota hai (site pehle jaisi dikhti rahe).

import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { FEATURED_SETTINGS_KEY, normalizeFlags } from '@/lib/featured-placements';

export const dynamic = 'force-dynamic';

export async function GET() {
  let flags = normalizeFlags(null);
  try {
    const { data } = await getSupabaseAdmin()
      .from('tracking_settings')
      .select('value')
      .eq('key', FEATURED_SETTINGS_KEY)
      .maybeSingle();
    flags = normalizeFlags(data?.value);
  } catch {
    // table nahi bana -> sab OFF
  }
  return NextResponse.json(
    { flags },
    { headers: { 'cache-control': 'public, s-maxage=60, stale-while-revalidate=300' } }
  );
}
