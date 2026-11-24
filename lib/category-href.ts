import { categoryPath } from '@/lib/category-url';

/**
 * Real, crawlable URL of a category page for a category NAME.
 * Uses the same categoryPath() as the sitemap / breadcrumbs, so it always points at a
 * URL that already exists (old Woo path when the category has one, else /category/<slug>/).
 * If the name is unknown (categories not loaded yet, renamed, ...) it falls back to the
 * old /shop?category= filter URL, which keeps working -- so a link can never 404.
 */
export function categoryHrefByName(
  categories: { name: string; slug: string; woo_path?: string | null }[] | undefined,
  name: string | null | undefined
): string {
  const n = (name || '').trim();
  if (!n) return '/shop/';
  const lower = n.toLowerCase();
  const match = (categories || []).find((c) => c.name.trim().toLowerCase() === lower);
  return match ? categoryPath(match) : `/shop?category=${encodeURIComponent(n)}`;
}
