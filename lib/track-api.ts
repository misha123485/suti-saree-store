'use client';

import { supabase } from './supabase';
import { ActivityEventType } from './types';

const SESSION_KEY = 'saaj_session_id';

/**
 * Every browser tab/visit gets a random session id kept in sessionStorage
 * (cleared when the tab closes). This is how we stitch together "what did
 * this visitor look at" without requiring the shopper to log in.
 */
export function getSessionId(): string {
  if (typeof window === 'undefined') return 'server';
  try {
    let id = window.sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      window.sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    // Storage disabled (private mode etc.) — fall back to a per-call id.
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

interface TrackOptions {
  pagePath?: string;
  productId?: string;
  orderId?: string;
  userId?: string | null;
  metadata?: Record<string, any>;
}

// Set by /api/track/click/<sendId> (a non-httpOnly cookie) when a visitor
// arrives here via a link inside a WooCommerce campaign email. Reading it
// here means every event this visitor triggers afterwards (page_view,
// product_view, purchase, ...) gets tagged with the same send id, which is
// how the admin's cold/warm/hot audience view knows this person actually
// browsed the site (warm) or went on to view 2+ pages / buy (hot) after
// that specific email.
function getCampaignSendId(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(/(?:^|;\s*)wc_sid=([0-9a-f-]{36})/i);
  return match ? match[1] : null;
}

// ── Shopper-insights context (visitor id, location, device, source) ────────
const VISITOR_KEY = 'saaj_visitor_id';
const GEO_KEY = 'saaj_geo_v1';
const SOURCE_KEY = 'saaj_src';
const GEO_TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface Geo {
  country: string | null;
  region: string | null;
  city: string | null;
}

function randomId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Same browser = same id across visits (localStorage). Used for "kitni baar repeat aaya". */
export function getVisitorId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    let id = window.localStorage.getItem(VISITOR_KEY);
    if (!id) {
      id = randomId();
      window.localStorage.setItem(VISITOR_KEY, id);
    }
    return id;
  } catch {
    return null;
  }
}

function getDevice(): string | null {
  if (typeof navigator === 'undefined') return null;
  return /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) ? 'mobile' : 'desktop';
}

/** utm_source, else referrer host, else 'direct'. Remembered for the tab session. */
function getSource(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const saved = window.sessionStorage.getItem(SOURCE_KEY);
    if (saved) return saved;
    const utm = new URLSearchParams(window.location.search).get('utm_source');
    let src = utm ? utm.toLowerCase().slice(0, 40) : 'direct';
    if (!utm && document.referrer) {
      const host = new URL(document.referrer).hostname.replace(/^www\./, '');
      if (host && host !== window.location.hostname.replace(/^www\./, '')) src = host.slice(0, 40);
    }
    window.sessionStorage.setItem(SOURCE_KEY, src);
    return src;
  } catch {
    return null;
  }
}

let geoPromise: Promise<Geo | null> | null = null;

function readCachedGeo(): Geo | null {
  try {
    const raw = window.localStorage.getItem(GEO_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Date.now() - parsed.at > GEO_TTL_MS) return null;
    return parsed.geo as Geo;
  } catch {
    return null;
  }
}

function getGeo(): Promise<Geo | null> {
  if (typeof window === 'undefined') return Promise.resolve(null);
  const cached = readCachedGeo();
  if (cached) return Promise.resolve(cached);
  if (!geoPromise) {
    geoPromise = fetch('/api/geo')
      .then((r) => (r.ok ? r.json() : null))
      .then((geo: Geo | null) => {
        if (geo && geo.country) {
          try {
            window.localStorage.setItem(GEO_KEY, JSON.stringify({ at: Date.now(), geo }));
          } catch {}
        }
        return geo;
      })
      .catch(() => null);
  }
  // Never hold up tracking for more than 1.5s waiting on location.
  return Promise.race([geoPromise, new Promise<null>((res) => setTimeout(() => res(null), 1500))]);
}

// ── Sirf asli insaan (human) ginne ke liye filters ─────────────────────────
// 1) Admin ne "is browser ko ignore karo" ON kiya ho to kuch track nahi hota.
// 2) Known bots / automation (Googlebot, headless Chrome, curl, ...) track nahi hote.
// 3) page_view / product_view tabhi jaate hain jab visitor ne kuch touch/click/hilaya ho.
//    (cart, checkout, purchase jaisi pakki actions par ye wait nahi hota.)
const IGNORE_KEY = 'saaj_ignore_me';
const HUMAN_KEY = 'saaj_human_v1';
const HUMAN_GATED_EVENTS = ['page_view', 'product_view'];
const BOT_RE =
  /bot|crawl|spider|slurp|facebookexternalhit|facebot|headless|lighthouse|pagespeed|gtmetrix|pingdom|uptime|monitor|python|curl\/|wget|httpclient|java\/|go-http|scrapy|phantom|selenium|puppeteer|playwright|ahrefs|semrush|mj12|dotbot|petalbot|yandex|baidu|duckduck|ia_archiver|embedly|preview/i;

function shouldSkipTracking(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    if (window.localStorage.getItem(IGNORE_KEY) === '1') return true;
  } catch {}
  try {
    const nav = window.navigator;
    if (BOT_RE.test(nav.userAgent || '')) return true;
    if ((nav as any).webdriver === true) return true;
  } catch {}
  return false;
}

let humanPromise: Promise<boolean> | null = null;

function waitForHuman(): Promise<boolean> {
  try {
    if (window.sessionStorage.getItem(HUMAN_KEY)) return Promise.resolve(true);
  } catch {}
  if (!humanPromise) {
    humanPromise = new Promise<boolean>((resolve) => {
      const evs = ['pointerdown', 'touchstart', 'keydown', 'mousemove', 'wheel'];
      const done = () => {
        evs.forEach((e) => window.removeEventListener(e, done));
        try {
          window.sessionStorage.setItem(HUMAN_KEY, '1');
        } catch {}
        resolve(true);
      };
      evs.forEach((e) => window.addEventListener(e, done, { passive: true }));
      // Bot ho to kabhi resolve nahi hoga -> event bas drop ho jaata hai.
    });
  }
  return humanPromise;
}

// ── "Trending" strip se aaya traffic pehchanne ke liye ─────────────────────
// Visitor strip ke kisi product par click kare to hum sessionStorage me yaad rakhte hain.
// Phir usi product ke product_view / add_to_cart / checkout_start events me
// metadata.via_featured = 'home' | 'shop' | ... judta hai. Admin Shopper Insights me
// isse "strip se kitne click, cart, order aaye" dikhta hai. Koi alag DB column/migration nahi.
const FEAT_KEY = 'saaj_feat_v1';
const FEAT_TTL_MS = 2 * 60 * 60 * 1000;

export function markFeaturedClick(productId: string, placement: string) {
  if (typeof window === 'undefined' || !productId) return;
  try {
    const raw = window.sessionStorage.getItem(FEAT_KEY);
    const map: Record<string, { p: string; at: number; v?: boolean }> = raw ? JSON.parse(raw) : {};
    const keys = Object.keys(map);
    if (keys.length > 30) delete map[keys[0]];
    map[productId] = { p: placement, at: Date.now() };
    window.sessionStorage.setItem(FEAT_KEY, JSON.stringify(map));
  } catch {}
}

function featuredTag(eventType: string, productId?: string): string | null {
  if (!productId || typeof window === 'undefined') return null;
  if (!['product_view', 'add_to_cart', 'checkout_start'].includes(eventType)) return null;
  try {
    const raw = window.sessionStorage.getItem(FEAT_KEY);
    if (!raw) return null;
    const map = JSON.parse(raw);
    const e = map[productId];
    if (!e || Date.now() - e.at > FEAT_TTL_MS) return null;
    if (eventType === 'product_view') {
      if (e.v) return null; // click sirf ek baar ginna
      e.v = true;
      window.sessionStorage.setItem(FEAT_KEY, JSON.stringify(map));
    }
    return e.p as string;
  } catch {
    return null;
  }
}

// ── Admin "tracking band karo" switches ─────────────────────────────────────
// Admin (Analytics > settings) kuch event types OFF kar sakta hai taaki DB na bhare.
// Config /api/track-config se aata hai, browser me 30 min cache hota hai.
// Sirf ye types check hote hain -- baaki events par koi extra kharcha nahi.
const CONTROLLABLE_EVENTS = ['variant_switch', 'search', 'wishlist'];
const CFG_KEY = 'saaj_track_cfg_v1';
const CFG_TTL_MS = 30 * 60 * 1000;
let cfgPromise: Promise<string[]> | null = null;

function readCachedCfg(): string[] | null {
  try {
    const raw = window.localStorage.getItem(CFG_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Date.now() - parsed.at > CFG_TTL_MS) return null;
    return Array.isArray(parsed.disabled) ? parsed.disabled : null;
  } catch {
    return null;
  }
}

function getDisabledEvents(): Promise<string[]> {
  if (typeof window === 'undefined') return Promise.resolve([]);
  const cached = readCachedCfg();
  if (cached) return Promise.resolve(cached);
  if (!cfgPromise) {
    cfgPromise = fetch('/api/track-config')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        const disabled: string[] = Array.isArray(j?.disabled) ? j.disabled : [];
        try {
          window.localStorage.setItem(CFG_KEY, JSON.stringify({ at: Date.now(), disabled }));
        } catch {}
        return disabled;
      })
      .catch(() => [] as string[])
      .finally(() => {
        // 30 min baad dobara fetch ho sake
        setTimeout(() => {
          cfgPromise = null;
        }, CFG_TTL_MS);
      });
  }
  // 1.5s se zyada intezaar nahi; na mile to tracking chalne do.
  return Promise.race([cfgPromise, new Promise<string[]>((res) => setTimeout(() => res([]), 1500))]);
}

/**
 * Fire-and-forget event log used by the Admin > Analytics dashboard for
 * sales trends, top products, conversion rate and customer behaviour.
 * Never throws — a failed tracking call should never break the storefront.
 */
export async function trackEvent(eventType: ActivityEventType, options: TrackOptions = {}) {
  try {
    if (shouldSkipTracking()) return;
    if (HUMAN_GATED_EVENTS.includes(eventType) && !(await waitForHuman())) return;
    if (CONTROLLABLE_EVENTS.includes(eventType) && (await getDisabledEvents()).includes(eventType)) return;
    const base = {
      session_id: getSessionId(),
      user_id: options.userId ?? null,
      event_type: eventType,
      page_path: options.pagePath ?? null,
      product_id: options.productId ?? null,
      order_id: options.orderId ?? null,
      metadata: (() => {
        const via = featuredTag(eventType, options.productId);
        return via ? { ...(options.metadata ?? {}), via_featured: via } : options.metadata ?? {};
      })(),
      campaign_send_id: getCampaignSendId(),
    };
    const geo = await getGeo();
    const { error } = await supabase.from('activity_events').insert({
      ...base,
      visitor_id: getVisitorId(),
      country: geo?.country ?? null,
      region: geo?.region ?? null,
      city: geo?.city ?? null,
      device: getDevice(),
      source: getSource(),
    });
    // If the Shopper Insights migration hasn't been run yet the extra columns
    // don't exist and the insert fails -- fall back to the old minimal row so
    // existing tracking keeps working either way.
    if (error) {
      await supabase.from('activity_events').insert(base);
    }
  } catch {
    // best-effort only
  }
}
