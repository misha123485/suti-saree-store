// Tag slugs that next.config.js 301-redirects somewhere else. They must NEVER appear
// in the sitemap (a sitemap URL that 301s is a "redirected URL" error in Search
// Console), even if the old tag row still exists in the database.
//
// Keep in sync with the `/product-tag/<slug>` entries in next.config.js ->
// `npm run audit:redirects` fails if this list and next.config.js drift apart.
export const REDIRECTED_TAG_SLUGS: ReadonlySet<string> = new Set([
  'saree-under-500',
  'saree-under-1500',
  'under-1500',
  'summer',
  'printed',
  'printed-saree',
  'silk-saree',
  'lichi-silk-saree',
  'ghicha-saree',
]);
