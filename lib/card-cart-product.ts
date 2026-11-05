import type { CartItem, Product } from '@/lib/types';
import { getVariantDisplayName } from '@/lib/variant-display-name';

export interface CardVariant {
  slug?: string | null;
  color?: string | null;
  image?: string | null;
}

const norm = (c?: string | null) => (c ?? '').trim().toLowerCase();

/** The colour a catalog card is showing: the variant's, else the product's own. */
export function cardColorOf(product: Product, variant?: CardVariant | null): string | null {
  return (variant?.color?.trim() || product.colors?.[0]?.trim() || '') || null;
}

/**
 * The exact `Product` a catalog card puts in the bag. When the card shows a
 * colour variant (not the base colour) it is shaped the same way the product
 * page and the exploded variant cards shape it -- same id, but its own
 * name/slug/colours/image -- so the cart line is that colour, not the base one.
 */
export function toCartProduct(product: Product, variant?: CardVariant | null): Product {
  const color = variant?.color?.trim();
  const base = product.colors?.[0]?.trim() ?? '';
  if (!color || norm(color) === norm(base)) return product;
  return {
    ...product,
    name: getVariantDisplayName(product.name, base, color),
    slug: variant?.slug || product.slug,
    colors: [color],
    images: variant?.image ? [variant.image, ...product.images.slice(1)] : product.images,
  };
}

/** Is THIS colour of the product already in the bag (any size)? Matching by
 *  id alone made every colour card of one product say "Added to Bag". */
export function isInBag(items: CartItem[], p: Product): boolean {
  return items.some((i) => i.product.id === p.id && norm(i.product.colors?.[0]) === norm(p.colors?.[0]));
}
