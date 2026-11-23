// SINGLE source of truth for the "offer id" of one sellable item (colour + size).
//
// The SAME value must appear in all of these, otherwise Google cannot link them:
//   * /api/merchant-feed            -> <g:id>
//   * product page JSON-LD          -> Product.sku  (lib/product-jsonld.ts)
//   * /api/product-reviews-feed     -> <skus><sku>  (lib/product-reviews-feed.ts buildProductSkus)
//   * gtag remarketing / purchase   -> items[].id   (lib/gtag-track.ts feedMatchedItemId)
//
// Rules (unchanged from the old inline code, so ids that were already valid DO NOT change):
//   product without colour variants -> product id
//   variant without sizes           -> variant id
//   variant with sizes              -> `${variant id}-${size without whitespace, max 10 chars}`
// New: the final value is sanitised to [A-Za-z0-9._-] (anything else -> "-") and capped at 50 chars
// (Merchant Center's limit). A size like "S/M" therefore becomes "S-M" instead of an invalid sku.
//
// Pure (no imports, no DB) and ES5-safe -- usable from the server, the browser and tsx scripts.

export const MAX_OFFER_ID_LENGTH = 50;

/** trim -> keep only [A-Za-z0-9._-] (others become "-") -> max 50 chars. "" when nothing usable is left. */
export function sanitizeSku(raw: unknown): string {
  let s: string;
  if (typeof raw === 'string') s = raw;
  else if (typeof raw === 'number' && isFinite(raw)) s = String(raw);
  else return '';
  s = s.trim().replace(/[^A-Za-z0-9._-]/g, '-').slice(0, MAX_OFFER_ID_LENGTH);
  // an id made only of separators ("---") is not a usable id
  return /[A-Za-z0-9]/.test(s) ? s : '';
}

/** Size part of an offer id: whitespace removed, max 10 chars (same as the original feed code). */
export function sizeIdPart(size: unknown): string {
  return typeof size === 'string' ? size.replace(/\s+/g, '').slice(0, 10) : '';
}

/**
 * The id the product feed sends as <g:id> for one item.
 *   feedOfferId({ productId })                               -> product id
 *   feedOfferId({ productId, variantId })                    -> variant id          (variant has no size rows)
 *   feedOfferId({ productId, variantId, size: 'XL' })        -> `${variantId}-XL`   (variant has size rows)
 * Returns "" only if every input is unusable (callers treat that as "no id" and skip / flag the item).
 */
export function feedOfferId(opts: {
  productId: string;
  variantId?: string | null;
  size?: string | null;
}): string {
  const variantId = typeof opts.variantId === 'string' ? opts.variantId.trim() : '';
  if (!variantId) return sanitizeSku(opts.productId);
  if (opts.size === undefined || opts.size === null) return sanitizeSku(variantId);
  return sanitizeSku(variantId + '-' + sizeIdPart(opts.size));
}

/** Values that occur more than once (case-sensitive, like Merchant Center). */
export function findDuplicateIds(ids: string[]): string[] {
  const seen: Record<string, number> = {};
  const dups: string[] = [];
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    seen[id] = (seen[id] || 0) + 1;
    if (seen[id] === 2) dups.push(id);
  }
  return dups;
}

/** Why a raw sku coming from the DB (products.sku / variant.sku / size.sku) would be rejected. null = fine. */
export function skuProblem(raw: unknown): string | null {
  if (raw === null || raw === undefined) return 'empty';
  if (typeof raw !== 'string') return 'not_a_string';
  if (raw.trim() === '') return 'empty';
  if (raw !== raw.trim()) return 'has_leading_or_trailing_space';
  if (raw.length > MAX_OFFER_ID_LENGTH) return 'longer_than_50';
  if (/[^A-Za-z0-9._-]/.test(raw)) return 'invalid_characters';
  return null;
}
