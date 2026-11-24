/**
 * A tag page with fewer live products than this is "thin content": it is set to
 * noindex,follow and left out of product_tag-sitemap.xml. The page itself and its URL
 * keep working exactly as before -- only Google's indexing of it changes.
 * Raise/lower this number (or set 1 to index every non-empty tag, as before).
 */
export const MIN_INDEXABLE_TAG_PRODUCTS = 3;
