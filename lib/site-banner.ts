/**
 * Site banner (Admin > Settings > Site Banner) — shared types + helpers.
 *
 * Deliberately has NO imports so it can be used from server code, client
 * code and the admin panel alike.
 *
 * Stored under settings.key = 'site_banner'. The shape is backward
 * compatible: older rows only have { image_url, link_url, show_on_home,
 * show_on_product }. `normalizeSiteBanner` turns such a row into a
 * single-slide banner on read, and on save we keep `image_url` /
 * `link_url` pointing at the first enabled slide so any older reader
 * keeps working.
 */

export interface SiteBannerSlide {
  id: string;
  image_url: string;
  /** Optional click-through for this slide. */
  link_url?: string;
  /** Disabled slides stay in the list but are not shown. */
  enabled: boolean;
}

export type SiteBannerSizeMode = 'default' | 'fixed';

export interface SiteBanner {
  /** Legacy / mirror of the first enabled slide. */
  image_url: string;
  link_url?: string;
  show_on_home?: boolean;
  show_on_product?: boolean;

  slides?: SiteBannerSlide[];
  /** Go back to the first slide after the last one (and allow wrap-around arrows). */
  loop?: boolean;
  /** Auto-slide only runs when true and there is more than one slide. */
  autoplay?: boolean;
  /** Show the slide icons (dots + prev/next arrows). Swipe / auto slide still work when off. */
  show_controls?: boolean;
  /** Seconds each slide stays on screen. */
  interval_seconds?: number;

  /** 'default' = natural image height, 'fixed' = fixed pixel height. */
  desktop_size_mode?: SiteBannerSizeMode;
  desktop_height?: number;
  mobile_size_mode?: SiteBannerSizeMode;
  mobile_height?: number;

  /** Keep the banner stuck just below the header while the visitor scrolls. */
  sticky?: boolean;

  /** Light CSS effect over the banner image: a gold shine sweeping across every few seconds. */
  fx_shine?: boolean;
  /** Light CSS effect over the banner image: gently falling snow + twinkling gold sparkles. */
  fx_festive?: boolean;
}

export const SITE_BANNER_MIN_INTERVAL = 2;
export const SITE_BANNER_MAX_INTERVAL = 30;
export const SITE_BANNER_MIN_HEIGHT = 60;
export const SITE_BANNER_MAX_HEIGHT = 1000;

export const DEFAULT_SITE_BANNER: SiteBanner = {
  image_url: '',
  link_url: '',
  show_on_home: false,
  show_on_product: false,
  slides: [],
  loop: true,
  autoplay: true,
  show_controls: true,
  interval_seconds: 5,
  desktop_size_mode: 'default',
  desktop_height: 400,
  mobile_size_mode: 'default',
  mobile_height: 160,
  sticky: false,
  fx_shine: false,
  fx_festive: false,
};

function clamp(n: unknown, min: number, max: number, fallback: number): number {
  const v = typeof n === 'number' ? n : Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.min(max, Math.max(min, Math.round(v)));
}

export function newBannerSlideId(): string {
  return `s_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

/** Accepts any stored value (or nothing) and returns a fully-populated banner. */
export function normalizeSiteBanner(raw: unknown): SiteBanner {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<SiteBanner>;

  let slides: SiteBannerSlide[] = Array.isArray(r.slides)
    ? r.slides
        .filter((s) => s && typeof s.image_url === 'string' && s.image_url)
        .map((s, i) => ({
          id: s.id || `s_${i}`,
          image_url: s.image_url,
          link_url: s.link_url || '',
          enabled: s.enabled !== false,
        }))
    : [];

  // Legacy single-image banner -> one slide.
  if (slides.length === 0 && !Array.isArray(r.slides) && r.image_url) {
    slides = [{ id: 'legacy', image_url: r.image_url, link_url: r.link_url || '', enabled: true }];
  }

  const firstEnabled = slides.find((s) => s.enabled);

  return {
    image_url: firstEnabled?.image_url || '',
    link_url: firstEnabled?.link_url || '',
    show_on_home: !!r.show_on_home,
    show_on_product: !!r.show_on_product,
    slides,
    loop: r.loop !== false,
    autoplay: r.autoplay !== false,
    show_controls: r.show_controls !== false,
    interval_seconds: clamp(
      r.interval_seconds,
      SITE_BANNER_MIN_INTERVAL,
      SITE_BANNER_MAX_INTERVAL,
      DEFAULT_SITE_BANNER.interval_seconds as number
    ),
    desktop_size_mode: r.desktop_size_mode === 'fixed' ? 'fixed' : 'default',
    desktop_height: clamp(
      r.desktop_height,
      SITE_BANNER_MIN_HEIGHT,
      SITE_BANNER_MAX_HEIGHT,
      DEFAULT_SITE_BANNER.desktop_height as number
    ),
    mobile_size_mode: r.mobile_size_mode === 'fixed' ? 'fixed' : 'default',
    mobile_height: clamp(
      r.mobile_height,
      SITE_BANNER_MIN_HEIGHT,
      SITE_BANNER_MAX_HEIGHT,
      DEFAULT_SITE_BANNER.mobile_height as number
    ),
    sticky: !!r.sticky,
    fx_shine: !!r.fx_shine,
    fx_festive: !!r.fx_festive,
  };
}

/** Value to persist: normalized, with the legacy mirror fields kept in sync. */
export function prepareSiteBannerForSave(banner: SiteBanner): SiteBanner {
  return normalizeSiteBanner({ ...banner, slides: banner.slides ?? [] });
}
