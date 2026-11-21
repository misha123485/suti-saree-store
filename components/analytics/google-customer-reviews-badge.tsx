'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { GCR_MERCHANT_ID } from '@/lib/google-customer-reviews';

// Pages that should never show the badge (back-office + payment flow).
const HIDDEN_PREFIXES = ['/admin', '/vendor', '/checkout'];

// Element Google's widget creates once start() has run. It lives in <body>
// and is NOT removed by React, so on client-side navigation it stays on
// screen even after this component stops rendering. We hide it by class
// (rather than touching its inline styles) on the pages listed above.
const WRAPPER_ID = 'google-merchantwidget-iframe-wrapper';
const HIDE_CLASS = 'gcr-badge-hidden';
const STYLE_ID = 'gcr-badge-hide-style';

function setWrapperHidden(hidden: boolean) {
  document.getElementById(WRAPPER_ID)?.classList.toggle(HIDE_CLASS, hidden);
}

/**
 * Google Customer Reviews badge (store widget) -- the small floating Google
 * widget that shows the store rating / quality. Mounted once in app/layout.tsx.
 *
 * Position: bottom-right (WhatsApp / live-chat buttons sit bottom-left).
 * On mobile it is lifted to clear the sticky "Add to Bag / Buy" bar on the
 * product page and the bottom nav (see mobileBottomMargin below).
 *
 * Switch it on/off from Admin > Marketing > Analytics (takes effect once the
 * layout re-renders, up to ~30 min, same as the other analytics toggles).
 * NEXT_PUBLIC_GCR_BADGE=off also forces it off.
 */
export default function GoogleCustomerReviewsBadge({ enabled = true }: { enabled?: boolean }) {
  const pathname = usePathname() || '';
  // Admin > Marketing > Analytics toggle (passed from app/layout.tsx), plus
  // the NEXT_PUBLIC_GCR_BADGE=off env flag as a hard kill-switch.
  const disabled = !enabled || process.env.NEXT_PUBLIC_GCR_BADGE === 'off';
  const hidden = HIDDEN_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  useEffect(() => {
    if (!document.getElementById(STYLE_ID)) {
      const style = document.createElement('style');
      style.id = STYLE_ID;
      // Mobile: lift the badge so it floats just above the sticky "Add to Bag /
      // Buy Now" bar on the product page (the bar publishes its height as
      // --sticky-bar-h, 0px while it is hidden). A transform is used for the
      // lift because it works whatever positioning Google's widget applies
      // inline. Elsewhere keep the usual 104px lift above the bottom nav
      // (the bar sets --gcr-base-bottom to 24px while it is mounted).
      style.textContent =
        `.${HIDE_CLASS}{display:none !important;}` +
        `@media (max-width:767px){#${WRAPPER_ID}{` +
        `bottom:var(--gcr-base-bottom,104px) !important;` +
        `transform:translateY(calc(-1 * var(--sticky-bar-h,0px))) !important;` +
        `transition:transform .2s ease !important;}}`;
      document.head.appendChild(style);
    }

    setWrapperHidden(hidden);
    if (!hidden) return;

    // The script may still be loading when the visitor lands on a hidden
    // page via client-side navigation; if the widget appears a moment later,
    // hide it as soon as it shows up.
    const observer = new MutationObserver(() => {
      if (document.getElementById(WRAPPER_ID)) setWrapperHidden(true);
    });
    observer.observe(document.body, { childList: true });
    return () => observer.disconnect();
  }, [hidden]);

  // Load Google's store widget exactly like the snippet in Merchant Center >
  // Customer Reviews > Badge integration: add the script, and on its "load"
  // event call merchantwidget.start({...}). Only the documented options are
  // passed (merchant_id, position, region).
  //
  // Add ?gcrdebug=1 to any page URL to log what happens in the console.
  useEffect(() => {
    if (disabled || hidden) return;
    const w = window as any;
    const debug = new URLSearchParams(window.location.search).has('gcrdebug');
    const log = (...a: unknown[]) => {
      if (debug) console.info('[GCR badge]', ...a);
    };

    const start = () => {
      if (w.__gcrBadgeStarted) return log('already started');
      if (!w.merchantwidget?.start) return console.warn('[GCR badge] merchantwidget.start is missing');
      try {
        w.__gcrBadgeStarted = true; // start() once per page load
        w.merchantwidget.start({
          merchant_id: GCR_MERCHANT_ID,
          position: 'RIGHT_BOTTOM',
          region: 'IN',
        });
        log('started with merchant_id', GCR_MERCHANT_ID);
      } catch (err) {
        w.__gcrBadgeStarted = false;
        console.warn('[GCR badge] start() failed', err);
      }
    };

    if (w.merchantwidget?.start) {
      start();
      return;
    }

    let script = document.getElementById('merchantWidgetScript') as HTMLScriptElement | null;
    const onError = () =>
      console.warn(
        '[GCR badge] merchantwidget.js could not be loaded (ad blocker, network or blocked gstatic.com?)'
      );
    if (!script) {
      script = document.createElement('script');
      script.id = 'merchantWidgetScript';
      script.src = 'https://www.gstatic.com/shopping/merchant/merchantwidget.js';
      script.defer = true;
      document.head.appendChild(script);
      log('script added');
    }
    script.addEventListener('load', start);
    script.addEventListener('error', onError);
    return () => {
      script?.removeEventListener('load', start);
      script?.removeEventListener('error', onError);
    };
  }, [disabled, hidden]);

  return null;
}
