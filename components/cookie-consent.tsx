'use client';

import { useEffect, useState } from 'react';

// Phase 7: minimal cookie-consent banner for UK / European visitors (GA4 Consent Mode v2).
//
// - India and every other region: renders nothing and changes nothing (tracking works exactly as before).
// - UK/Europe (browser timezone Europe/* or the country switcher set to GB): the inline stub in
//   components/analytics-scripts.tsx sets consent to "denied" BEFORE any Google tag loads; this banner
//   lets the visitor accept or decline and then calls gtag('consent','update', ...).
// - The choice is remembered for 180 days in the cookie `sutisaree_consent` (granted | denied).

const COOKIE = 'sutisaree_consent';

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return m ? decodeURIComponent(m[1]) : null;
}

function isEuropeanVisitor(): boolean {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    return tz.startsWith('Europe/') || readCookie('sutisaree_cc') === 'GB';
  } catch {
    return false;
  }
}

type GtagFn = (...args: unknown[]) => void;

function updateConsent(granted: boolean) {
  const value = granted ? 'granted' : 'denied';
  const w = window as unknown as { gtag?: GtagFn; dataLayer?: unknown[] };
  if (!w.gtag) {
    w.dataLayer = w.dataLayer || [];
    w.gtag = function () {
      // eslint-disable-next-line prefer-rest-params
      (w.dataLayer as unknown[]).push(arguments);
    };
  }
  w.gtag('consent', 'update', {
    ad_storage: value,
    analytics_storage: value,
    ad_user_data: value,
    ad_personalization: value,
  });
}

export default function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (readCookie(COOKIE)) return;
    if (isEuropeanVisitor()) setVisible(true);
  }, []);

  const choose = (granted: boolean) => {
    const maxAge = 60 * 60 * 24 * 180;
    document.cookie = `${COOKIE}=${granted ? 'granted' : 'denied'}; path=/; max-age=${maxAge}; SameSite=Lax`;
    updateConsent(granted);
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label="Cookie consent"
      className="fixed inset-x-0 bottom-0 z-[100] border-t border-border bg-background p-4 shadow-lg sm:left-4 sm:right-auto sm:bottom-4 sm:max-w-md sm:rounded-lg sm:border"
    >
      <p className="text-sm text-foreground">
        We use cookies for analytics and advertising to understand how our shop is used. Essential cookies for your
        cart and checkout are always on. See our{' '}
        <a href="/privacy-policy/" className="underline">Privacy Policy</a>.
      </p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => choose(true)}
          className="rounded bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          Accept
        </button>
        <button
          type="button"
          onClick={() => choose(false)}
          className="rounded border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted"
        >
          Decline
        </button>
      </div>
    </div>
  );
}
