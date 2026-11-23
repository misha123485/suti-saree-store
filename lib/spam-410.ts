import { SPAM_SLUGS } from '@/data/spam-slugs';

/**
 * Spam handling for the hacked-WordPress leftovers.
 *
 * Google must see HTTP 410 Gone (not 404) for these URLs so they drop out of
 * the index faster. Two layers:
 *   1. the exact 62 slugs in data/spam-slugs.ts
 *   2. keyword patterns, so NEW variants of the same spam (casino, slot, bet,
 *      bdm, wazamba, vulkan ...) are 410 too, at the site root or under /blog/.
 *
 * Only single-segment root paths and /blog/<slug>[/...] are ever checked, and
 * root paths that are real routes in this repo are never touched.
 */

const SPAM_SET = new Set<string>(SPAM_SLUGS);

/** Whole "words" (split on "-") that mark a slug as gambling spam. */
const SPAM_TOKENS = new Set([
  'casino', 'casinos', 'slot', 'slots', 'bet', 'bets', 'betting', 'bdm', 'bdmbet',
  'wazamba', 'vulkan', 'jackpot', 'jackpots', 'poker', 'roulette', 'blackjack',
  'betway', 'betfair', 'bet365', 'gambling', 'gransino', 'gratorama', 'turbowins', 'goldenbet', 'sportsbook',
]);

/** Words ending in "bet" such as goldenbet / ivybet / tenobet (not "alphabet"). */
const BET_SUFFIX = /^[a-z]{3,}bet$/;
const NOT_BET = new Set(['alphabet']);

/** Real top-level routes of this app: never treat these as spam. */
const REAL_ROOTS = new Set([
  'about', 'account', 'admin', 'affiliate-program', 'api', 'auth', 'blog', 'cart', 'cart-link',
  'categories', 'category', 'checkout', 'checkout-link', 'collection', 'confirm-order', 'contact',
  'contact-us', 'feeds', 'forgot-password', 'gift-cards', 'legal', 'login', 'loyalty', 'media',
  'order-confirmation', 'product', 'product-category', 'product-size', 'product-tag', 'recover',
  'refer-earn', 'reseller-login', 'reseller-registration', 'reset-password', 'review', 'search',
  'sell-with-us', 'shop', 'signup', 'store', 'tag', 'track', 'vendor', 'vendor-login',
  'vendor-registration', 'video-shopping', 'sitemap_index.xml', 'sitemap.xml', 'robots.txt', 'rss.xml',
]);

export function isSpamSlug(rawSlug: string): boolean {
  let slug = rawSlug.toLowerCase();
  try {
    slug = decodeURIComponent(slug);
  } catch {
    /* keep raw */
  }
  slug = slug.replace(/\.(html?|php)$/, '');
  if (!slug) return false;
  if (SPAM_SET.has(slug)) return true;
  // test-post-<uuid>-<hash> junk left by an old plugin
  if (/^test-post-[0-9a-f-]{8,}/.test(slug)) return true;
  return slug.split('-').some((t) => SPAM_TOKENS.has(t) || (!NOT_BET.has(t) && BET_SUFFIX.test(t)));
}

/** True when the request path is a spam URL that must answer 410 Gone. */
export function isSpamPath(pathname: string): boolean {
  const segs = pathname.split('/').filter(Boolean);
  if (segs.length === 0) return false;
  const first = segs[0].toLowerCase();
  if (first === 'blog') return segs.length >= 2 && isSpamSlug(segs[1]);
  if (REAL_ROOTS.has(first)) return false;
  // WordPress used /<slug>/ at the root, also /<slug>/feed/, /<slug>/amp/ ...
  return isSpamSlug(segs[0]);
}

export function goneResponseHtml(): string {
  return (
    '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
    '<meta name="robots" content="noindex,nofollow"><title>410 Gone | Suti Saree</title></head>' +
    '<body style="font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem">' +
    '<h1>410 - This page has been permanently removed</h1>' +
    '<p>The page you are looking for no longer exists.</p>' +
    '<p><a href="/">Go to the Suti Saree home page</a></p></body></html>'
  );
}
