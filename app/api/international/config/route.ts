import { NextResponse } from 'next/server';
import { getPublicInternationalConfig } from '@/lib/intl-server';

// Public, read-only. Nothing secret here: enabled flag, public pricing settings, enabled countries
// and active zone rates (the same numbers the customer sees at checkout). Empty while disabled.
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const cfg = await getPublicInternationalConfig();
    return NextResponse.json(
      {
        enabled: cfg.settings.international_enabled,
        settings: cfg.settings,
        countries: cfg.countries.map(({ notes: _n, ...c }) => c),
        zones: cfg.zones.map((z) => ({
          id: z.id,
          name: z.name,
          countries: z.countries,
          base_rate_inr: z.base_rate_inr,
          per_extra_500g_inr: z.per_extra_500g_inr,
          free_shipping_threshold_inr: z.free_shipping_threshold_inr,
          min_order_inr: z.min_order_inr,
          eta_min_days: z.eta_min_days,
          eta_max_days: z.eta_max_days,
        })),
      },
      { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' } },
    );
  } catch {
    return NextResponse.json({ enabled: false, settings: null, countries: [], zones: [] });
  }
}
