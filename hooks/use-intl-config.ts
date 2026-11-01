'use client';
import { useEffect, useState } from 'react';
import {
  DEFAULT_INTERNATIONAL_SETTINGS,
  normalizeInternationalSettings,
  type InternationalSettings,
} from '@/lib/intl-api';
import type { PublicIntlCountry, PublicIntlZone } from '@/lib/intl-checkout';

export interface IntlConfigState {
  loaded: boolean;
  /** true only when: master switch ON + card payments configured + at least one country with an active zone. */
  active: boolean;
  settings: InternationalSettings;
  countries: PublicIntlCountry[];
  zones: PublicIntlZone[];
}

const EMPTY: IntlConfigState = {
  loaded: false,
  active: false,
  settings: DEFAULT_INTERNATIONAL_SETTINGS,
  countries: [],
  zones: [],
};

// Reads the public /api/international/config route (Admin > Settings > International Selling).
// Any failure leaves checkout India-only.
export function useIntlConfig(): IntlConfigState {
  const [state, setState] = useState<IntlConfigState>(EMPTY);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/international/config')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('failed'))))
      .then((d) => {
        if (cancelled) return;
        const zones = (d.zones || []) as PublicIntlZone[];
        const countries = ((d.countries || []) as PublicIntlCountry[]).filter((c) =>
          zones.some((z) => z.countries.includes(c.code)),
        );
        setState({
          loaded: true,
          active: !!d.enabled && !!d.payments_ready && countries.length > 0,
          settings: normalizeInternationalSettings(d.settings),
          countries,
          zones,
        });
      })
      .catch(() => !cancelled && setState({ ...EMPTY, loaded: true }));
    return () => {
      cancelled = true;
    };
  }, []);
  return state;
}
