// Public, bahut halka endpoint: browser (lib/track-api.ts) isse puchta hai ki
// kaun se event types abhi band hain (admin ne Analytics settings me OFF kiye).
// Vercel CDN isko 60s cache karta hai, aur browser 30 min localStorage me rakhta hai,
// isliye Supabase par bahut kam load aata hai.
// Koi bhi error aaye to "kuch band nahi" return hota hai (tracking pehle jaisi chalti rahe).

import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

export async function GET() {
  let disabled: string[] = [];
  try {
    const { data } = await getSupabaseAdmin()
      .from('tracking_settings')
      .select('value')
      .eq('key', 'disabled_event_types')
      .maybeSingle();
    if (data && Array.isArray(data.value)) disabled = data.value.filter((v: unknown) => typeof v === 'string');
  } catch {
    // table nahi bana ya koi error -> sab ON
  }
  return NextResponse.json(
    { disabled },
    { headers: { 'cache-control': 'public, s-maxage=60, stale-while-revalidate=300' } }
  );
}
