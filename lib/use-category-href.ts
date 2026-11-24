'use client';

import { useCallback } from 'react';
import { useCategories } from '@/lib/cart-context';
import { categoryHrefByName } from '@/lib/category-href';

/** Client helper: (categoryName) => real category page URL (falls back to /shop?category=). */
export function useCategoryHref(): (name: string | null | undefined) => string {
  let categories: { name: string; slug: string; woo_path?: string | null }[] = [];
  try {
    categories = useCategories().categories;
  } catch {
    categories = [];
  }
  return useCallback((name) => categoryHrefByName(categories, name), [categories]);
}
