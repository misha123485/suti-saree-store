// Image URLs for Google (product feed image_link / additional_image_link and Product JSON-LD image[]).
//
// Rules:
//  * ORIGINAL full-size file only. The image pipeline (lib/image-sizes.ts) creates name-sm.* (480px) and
//    name-md.* (900px) siblings for the site's own <Image> loader; the DB normally stores the original,
//    but if a -sm/-md url ever got stored it is mapped back to the original here.
//  * Absolute https URL on our own domain (storage hosts are rewritten by lib/media-url.ts).
//  * Only http(s), no spaces, de-duplicated.
import { toPublicMediaUrl } from './media-url';

const DEFAULT_SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.sutisaree.com').replace(/\/+$/, '');

// "photo-sm.webp" / "photo-md.jpg?x=1" -> "photo.webp" / "photo.jpg?x=1"
const THUMB_SUFFIX_RE = /-(?:sm|md)(\.[A-Za-z0-9]{2,5})(\?[^#]*)?(#.*)?$/;

/** True when the url points to a generated -sm / -md thumbnail instead of the original. */
export function isThumbnailUrl(url: string): boolean {
  return THUMB_SUFFIX_RE.test(String(url || ''));
}

/** Maps a -sm / -md thumbnail url back to the original file's url. Other urls are returned unchanged. */
export function toOriginalImageUrl(url: string): string {
  return String(url || '').replace(THUMB_SUFFIX_RE, '$1$2$3');
}

/** One image url -> absolute, original, own-domain url. null when it is not a usable http(s) url. */
export function toFeedImageUrl(raw: string | null | undefined, siteUrl?: string): string | null {
  const site = (siteUrl || DEFAULT_SITE_URL).replace(/\/+$/, '');
  let u = toPublicMediaUrl(raw);
  if (!u) return null;
  u = u.trim();
  if (u.indexOf('//') === 0) u = 'https:' + u;
  else if (u.charAt(0) === '/') u = site + u;
  if (!/^https?:\/\/[^\s/]+/i.test(u.replace(/ /g, '%20'))) return null;
  u = u.replace(/ /g, '%20');
  if (/[\u0000-\u001F\u007F]/.test(u)) return null;
  return toOriginalImageUrl(u);
}

/** Many image urls -> usable, de-duplicated, order preserved. */
export function toFeedImageUrls(raws: (string | null | undefined)[] | null | undefined, siteUrl?: string): string[] {
  const out: string[] = [];
  const seen: Record<string, boolean> = {};
  for (let i = 0; i < (raws || []).length; i++) {
    const u = toFeedImageUrl((raws as (string | null | undefined)[])[i], siteUrl);
    if (!u || seen[u]) continue;
    seen[u] = true;
    out.push(u);
  }
  return out;
}
