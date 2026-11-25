/**
 * Cached data for the /shop page (Supabase egress + Vercel CPU saver).
 *
 * WHY THIS FILE EXISTS
 * /shop reads `searchParams` (?page=N), so Next.js renders it per request
 * (it cannot be fully static). Before this file every single hit -- and bots
 * hit /shop/page/14, /16, /17 thousands of times -- ran ALL of these queries:
 *   - every live product (+ variants + sizes) and every category
 *   - up to 15,000 activity_events + 5,000 orders (top-variant map)
 *   - an `.in()` lookup of every product image for blur previews
 *   - 2 settings rows
 * Now each block is stored in Next's Data Cache (unstable_cache) and shared
 * by every request, so a bot hit costs ~0 Supabase queries.
 *
 * FRESHNESS
 * - Products/categories/settings: 5 min, AND purged instantly when admin saves
 *   a product/category (revalidateTag('shop-data') in the admin routes).
 * - Top-variant map: 1 h (same as the popularity ranking).
 * - Blur previews: 6 h (they almost never change).
 * If an entry is ever > 2 MB Next just skips caching it (page still works).
 */
import { unstable_cache } from 'next/cache';
import { fetchProductsServer, fetchCategoriesServer } from '@/lib/products-api-server';
import { fetchTopVariantMapServer, toJSON, TopVariantMapJSON } from '@/lib/top-variant-server';
import { getBlurPreviews } from '@/lib/blur-preview';
import { toPublicMediaUrl } from '@/lib/media-url';
import { fetchCatalogListingSettings, DEFAULT_CATALOG_LISTING_SETTINGS } from '@/lib/settings-api';
import { fetchFulfillmentSettings, DEFAULT_FULFILLMENT_SETTINGS } from '@/lib/marketing-api';

export const SHOP_DATA_TAG = 'shop-data';

const CATALOG_TTL = 300; // 5 min
const SETTINGS_TTL = 300;
const TOP_VARIANT_TTL = 3600; // 1 h
const BLUR_TTL = 21600; // 6 h
const BLUR_CHUNK = 60; // keeps every cache entry far below the 2 MB limit

// The grid never shows a product description, so it is dropped BEFORE caching
// (smaller cache entry, smaller HTML for phones).
const getCatalog = unstable_cache(
  async () => {
    const [products, categories] = await Promise.all([fetchProductsServer(), fetchCategoriesServer()]);
    return {
      products: products.map((p) => ({ ...p, description: '' })),
      categories,
    };
  },
  ['shop-catalog-v1'],
  { revalidate: CATALOG_TTL, tags: [SHOP_DATA_TAG] }
);

const getTopVariantsJSON = unstable_cache(
  async (): Promise<TopVariantMapJSON> => toJSON(await fetchTopVariantMapServer()),
  ['shop-top-variants-v1'],
  { revalidate: TOP_VARIANT_TTL, tags: [SHOP_DATA_TAG] }
);

const getBlurChunk = unstable_cache(
  async (urls: string[]): Promise<Record<string, string>> => Object.fromEntries(await getBlurPreviews(urls)),
  ['shop-blur-chunk-v1'],
  { revalidate: BLUR_TTL, tags: [SHOP_DATA_TAG] }
);

const getListingSettings = unstable_cache(
  async () => fetchCatalogListingSettings(),
  ['shop-listing-settings-v1'],
  { revalidate: SETTINGS_TTL, tags: [SHOP_DATA_TAG] }
);

const getFulfillmentSettings = unstable_cache(
  async () => fetchFulfillmentSettings(),
  ['shop-fulfillment-settings-v1'],
  { revalidate: SETTINGS_TTL, tags: [SHOP_DATA_TAG] }
);

export type ShopCatalog = Awaited<ReturnType<typeof getCatalog>>;

export async function loadShopCatalog(): Promise<ShopCatalog> {
  return getCatalog();
}

export async function loadTopVariantsJSON(): Promise<TopVariantMapJSON> {
  return getTopVariantsJSON();
}

/** Same result as the old inline code: image URL -> blur data URL, for every card image. */
export async function loadBlurPreviews(products: ShopCatalog['products']): Promise<Record<string, string>> {
  const urls = new Set<string>();
  for (const p of products) {
    const main = toPublicMediaUrl(p.default_variant_image || p.images[0]);
    const hover = toPublicMediaUrl(p.images[1]);
    if (main) urls.add(main);
    if (hover) urls.add(hover);
  }
  const all = Array.from(urls);
  const chunks: string[][] = [];
  for (let i = 0; i < all.length; i += BLUR_CHUNK) chunks.push(all.slice(i, i + BLUR_CHUNK));
  const results = await Promise.all(chunks.map((c) => getBlurChunk(c).catch(() => ({} as Record<string, string>))));
  return Object.assign({}, ...results);
}

export async function loadShopSettings() {
  const [listingRes, fulfillmentRes] = await Promise.allSettled([getListingSettings(), getFulfillmentSettings()]);
  return {
    listingSettings: listingRes.status === 'fulfilled' ? listingRes.value : DEFAULT_CATALOG_LISTING_SETTINGS,
    fulfillment: fulfillmentRes.status === 'fulfilled' ? fulfillmentRes.value : DEFAULT_FULFILLMENT_SETTINGS,
  };
}
