# Part 2 – Product JSON-LD (Search Console) + product feed (Merchant Center)

Branch: `fix/reviews-feed-and-schema`. Part 1 (reviews feed) is untouched except that `buildProductSkus()` now
calls the shared id helper (same output for every id that was already valid).

## Files changed / added
| File | Why |
|---|---|
| `lib/feed-ids.ts` (new) | ONE `feedOfferId()` = product id / variant id / `${variantId}-${size}`, sanitised to `[A-Za-z0-9._-]`, max 50. Used by the feed `<g:id>`, the JSON-LD `sku`, the reviews feed `<sku>` and gtag, so they can never drift. |
| `lib/feed-images.ts` (new) | Absolute, ORIGINAL (never `-sm`/`-md`) own-domain image URLs for feed + JSON-LD. |
| `lib/feed-description.ts` (new) | Pure, tested feed description: strips HTML/junk, appends only REAL attributes (Color, Fabric, Pattern, Work, Border, Blouse, Length, Occasion, Origin, Care). `resolveFeedColor()` for `<g:color>`. |
| `lib/product-jsonld.ts` (new) | Pure Product JSON-LD builder + `validateProductJsonLd()`. `offers` always present; rating/review only from real approved reviews. |
| `lib/product-schema-server.ts` (new) | Reads approved reviews (1-5) of a product from the `reviews` table + the feed brand. Errors -> no rating (never a fake one). |
| `app/product/[slug]/product-page-body.tsx` | Replaced the inline JSON-LD object with `buildProductJsonLd()`. Removed stale `variant.rating/reviews` usage and the non-schema `slug` key. |
| `app/api/merchant-feed/route.ts` | `<g:id>` via `feedOfferId`, description via `buildFeedDescription`, colour via `resolveFeedColor`, images via `toFeedImageUrls`; an item with a missing/0/NaN price is skipped instead of crashing the whole feed (`price.toFixed` on null = HTTP 500). |
| `lib/product-reviews-feed.ts` | `buildProductSkus()` uses `feedOfferId` (nothing else touched). |
| `lib/gtag-track.ts` | `feedMatchedItemId()` delegates to `feedOfferId` (remarketing ids = feed ids). |
| `scripts/test-feed-ids.ts`, `scripts/test-product-jsonld.ts`, `scripts/test-feed-description.ts` (new) | Unit tests (161 checks). |
| `scripts/catalog-loader.ts`, `scripts/audit-product-schema.ts`, `scripts/check-image-sizes.ts` (new) | Owner-run audits (read-only). |
| `package.json` | npm scripts only (no new dependency; `sharp` was already installed). |

## How to run
```
npm run typecheck
npm run test:schema            # feed ids, JSON-LD, feed description, reviews feed (Part 1) - all must pass
npm run audit:product-schema   # writes product-schema-audit.csv  (needs NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY in .env.local)
npm run check:image-sizes      # writes images-below-500x500.csv   (add  -- --limit 20  for a quick test)
```
`audit:product-schema` prints (1) the products whose offer is invalid (price missing / 0 / NaN) = the
"Either offers, review, or aggregateRating" items, (2) every invalid / duplicate sku, (3) products whose
`products.rating`/`products.reviews` columns are stale. Windows CMD safe (only `npx tsx` and `&&`).

## Behaviour notes
* Zero real approved reviews -> NO `aggregateRating` and NO `review` (not even 0). With reviews: average + count
  computed from the rows, `review[]` capped at 10, author = first name or "Anonymous", text sanitised.
* JSON-LD `sku` = feed `<g:id>` of the colour+size shown (`?size=` or first size, like the page). A BASE product
  page (no colour selected) of a product that has colour variants uses the product id, which is the feed's
  `item_group_id` and is also in the reviews feed `<skus>`.
* A product with no usable price still gets an `offers` block, but it is declared OutOfStock and listed by the audit.
* `<g:mpn>` / `<mpns>` were NOT added: the feed sends `identifier_exists=false`, so an MPN would contradict it.
