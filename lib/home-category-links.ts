import { categoryPath } from '@/lib/category-url';
import type { CategoryRow } from '@/lib/types';

/** The 6 categories the home page links to, with the keyword anchor text.
 *  `slugs` are tried in order (the silk category exists under two slugs). */
export const HOME_CATEGORY_LINKS: { anchor: string; slugs: string[]; blurb: string }[] = [
  { anchor: 'Cotton Sarees for Women', slugs: ['cotton-saree'], blurb: 'Soft, breathable everyday and office wear' },
  { anchor: 'Mulmul Sarees', slugs: ['mulmul-saree'], blurb: 'Feather-light mulmul cotton for hot weather' },
  { anchor: 'Handloom Sarees', slugs: ['handloom-saree'], blurb: 'Hand-woven by weavers across India' },
  { anchor: 'Sarees Under 500', slugs: ['under-499-saree'], blurb: 'Budget-friendly sarees under Rs. 500' },
  { anchor: 'Silk Sarees', slugs: ['silk-sarees-saree', 'silk-sarees'], blurb: 'Silk and silk-blend sarees for festive days' },
  { anchor: 'Plain Sarees', slugs: ['plain-saree'], blurb: 'Solid-colour sarees that go with everything' },
];

export interface HomeCategoryLink {
  anchor: string;
  href: string;
  blurb: string;
}

/** Only categories that really exist are returned, so the home page never links to a 404. */
export function resolveHomeCategoryLinks(categories: Pick<CategoryRow, 'slug' | 'woo_path'>[]): HomeCategoryLink[] {
  const out: HomeCategoryLink[] = [];
  for (const l of HOME_CATEGORY_LINKS) {
    const cat = l.slugs.map((s) => categories.find((c) => c.slug === s)).find(Boolean);
    if (!cat) {
      console.warn(`[home-category-links] skipped "${l.anchor}" - category ${l.slugs.join('/')} not found`);
      continue;
    }
    out.push({ anchor: l.anchor, href: categoryPath(cat), blurb: l.blurb });
  }
  return out;
}
