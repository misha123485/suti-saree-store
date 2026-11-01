'use client';

// Which country/currency is this visitor shopping in?
//   order: ?cc=XX (Google Shopping links) -> cookie sutisaree_cc (30 days) -> India.
// India visitors: nothing changes at all. For an enabled international country the storefront
// re-renders once with converted prices (formatINR reads the display currency from lib/intl-pricing).
import { createContext, Fragment, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useIntlConfig } from '@/hooks/use-intl-config';
import { setDisplayCurrency } from '@/lib/intl-pricing';
import type { PublicIntlCountry, PublicIntlZone } from '@/lib/intl-checkout';

const COOKIE = 'sutisaree_cc';
const THIRTY_DAYS = 60 * 60 * 24 * 30;

function readCookie(): string | null {
  try {
    const m = document.cookie.match(new RegExp(`(?:^|; )${COOKIE}=([A-Za-z]{2})`));
    return m ? m[1].toUpperCase() : null;
  } catch {
    return null;
  }
}
function writeCookie(code: string) {
  try {
    document.cookie = `${COOKIE}=${code}; path=/; max-age=${THIRTY_DAYS}; SameSite=Lax`;
  } catch {
    /* cookies blocked: country just won't persist */
  }
}

interface CountryContextValue {
  /** International selling is on and at least one country can be selected. */
  switcherAvailable: boolean;
  /** 'IN' unless the visitor is shopping in an enabled international country. */
  countryCode: string;
  currency: string;
  countryName: string;
  countries: PublicIntlCountry[];
  zones: PublicIntlZone[];
  setCountry: (code: string) => void;
}

const DEFAULT: CountryContextValue = {
  switcherAvailable: false,
  countryCode: 'IN',
  currency: 'INR',
  countryName: 'India',
  countries: [],
  zones: [],
  setCountry: () => {},
};

const CountryContext = createContext<CountryContextValue>(DEFAULT);
const VersionContext = createContext(0);

export function useCountry(): CountryContextValue {
  return useContext(CountryContext);
}

export function CountryProvider({ children }: { children: React.ReactNode }) {
  const intl = useIntlConfig();
  const [selected, setSelected] = useState<string>('IN');
  const [version, setVersion] = useState(0);
  const appliedRef = useRef<string>('IN');

  useEffect(() => {
    if (!intl.loaded) return;
    let want = 'IN';
    try {
      const q = new URLSearchParams(window.location.search).get('cc')?.toUpperCase() ?? null;
      const fromQuery = q && /^[A-Z]{2}$/.test(q) ? q : null;
      const enabled = (code: string) => code === 'IN' || (intl.active && intl.countries.some((c) => c.code === code));
      if (fromQuery && enabled(fromQuery)) {
        want = fromQuery;
        writeCookie(fromQuery);
      } else {
        const fromCookie = readCookie();
        want = fromCookie && enabled(fromCookie) ? fromCookie : 'IN';
      }
    } catch {
      want = 'IN';
    }

    const country = want === 'IN' ? null : intl.countries.find((c) => c.code === want) ?? null;
    setDisplayCurrency(
      country ? { countryCode: country.code, countryName: country.name, currency: country.currency, settings: intl.settings } : null,
      'provider',
    );
    setSelected(country ? country.code : 'IN');
    // Re-render the storefront once, only when the currency actually changed from what was drawn.
    if (appliedRef.current !== (country ? country.code : 'IN')) {
      appliedRef.current = country ? country.code : 'IN';
      setVersion((v) => v + 1);
    }
  }, [intl.loaded, intl.active, intl.countries, intl.settings]);

  const setCountry = useCallback((code: string) => {
    const clean = code.toUpperCase();
    writeCookie(clean);
    try {
      // Drop ?cc= so the old link can't switch the country straight back, then reload clean.
      const url = new URL(window.location.href);
      url.searchParams.delete('cc');
      window.location.href = url.toString();
    } catch {
      window.location.reload();
    }
  }, []);

  const value = useMemo<CountryContextValue>(() => {
    const c = selected === 'IN' ? null : intl.countries.find((x) => x.code === selected) ?? null;
    return {
      switcherAvailable: intl.active && intl.countries.length > 0,
      countryCode: c ? c.code : 'IN',
      currency: c ? c.currency : 'INR',
      countryName: c ? c.name : 'India',
      countries: intl.countries,
      zones: intl.zones,
      setCountry,
    };
  }, [selected, intl.active, intl.countries, intl.zones, setCountry]);

  return (
    <CountryContext.Provider value={value}>
      <VersionContext.Provider value={version}>{children}</VersionContext.Provider>
    </CountryContext.Provider>
  );
}

/** Wrap the storefront chrome: bumping the key re-renders every price once when the currency changes. */
export function CountryRemount({ children }: { children: React.ReactNode }) {
  const version = useContext(VersionContext);
  return <Fragment key={version}>{children}</Fragment>;
}
