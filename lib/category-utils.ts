import type { Product } from './types';

// A product can live in several categories (WooCommerce style):
//   category        = its PRIMARY category (what older code used)
//   category_names  = ALL categories it belongs to (may or may not repeat the primary)
// Everything that decides "which products are in category X" must use these
// helpers, otherwise a product only shows up in its primary category.

type CategoryFields = Pick<Product, 'category'> & { category_names?: string[] | null };

/** Every category name this product belongs to (primary first, no duplicates). */
export function productCategoryNames(p: CategoryFields): string[] {
  const out: string[] = [];
  for (const n of [p.category, ...(p.category_names ?? [])]) {
    if (n && !out.includes(n)) out.push(n);
  }
  return out;
}

/** True when the product belongs to the category called `name`. */
export function productInCategory(p: CategoryFields, name: string): boolean {
  return p.category === name || (p.category_names ?? []).includes(name);
}
