// Shared (browser + server) list of places where "top products" strips can be shown.
// Admin turns each one ON/OFF from Admin > Analytics > settings button.
// Default: sab OFF -- jab tak admin ON na kare kuch bhi nahi dikhta.

export type FeaturedPlacement = 'home' | 'shop' | 'category' | 'product' | 'similar';

export const FEATURED_PLACEMENTS: FeaturedPlacement[] = ['home', 'shop', 'category', 'product', 'similar'];

export const FEATURED_SETTINGS_KEY = 'featured_placements';

export type FeaturedFlags = Record<FeaturedPlacement, boolean>;

export function normalizeFlags(raw: unknown): FeaturedFlags {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    home: obj.home === true,
    shop: obj.shop === true,
    category: obj.category === true,
    product: obj.product === true,
    similar: obj.similar === true,
  };
}
