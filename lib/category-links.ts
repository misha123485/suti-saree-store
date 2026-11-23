// Server-only: turns the editable link list in lib/category-seo.ts into real hrefs.
// A link is only rendered when its target exists AND has products, so the page
// never links to a 404 or to a noindex (empty) archive.
import { categoryPath } from '@/lib/category-url';
import { productInCategory } from '@/lib/category-utils';
import { fetchAllTagsServer, fetchTagProductIdsServer } from '@/lib/products-api-server';
import type { CategorySeoLink } from '@/lib/category-seo';
import type { CategoryRow, Product } from '@/lib/types';

export interface ResolvedLink {
  label: string;
  href: string;
}

export async function resolveExploreLinks(
  links: CategorySeoLink[] | undefined,
  categories: CategoryRow[],
  products: Product[],
  selfPath: string
): Promise<ResolvedLink[]> {
  if (!links || links.length === 0) return [];

  const needsTags = links.some((l) => l.kind === 'tag');
  let tags: { id: string; slug: string }[] = [];
  if (needsTags) {
    try {
      tags = await fetchAllTagsServer();
    } catch {
      tags = [];
    }
  }

  const resolved = await Promise.all(
    links.map(async (l): Promise<ResolvedLink | null> => {
      if (l.kind === 'category') {
        const cat = categories.find((c) => c.slug === l.slug);
        if (!cat) return null;
        if (!products.some((p) => productInCategory(p, cat.name))) return null;
        return { label: l.label, href: categoryPath(cat) };
      }
      const tag = tags.find((t) => t.slug === l.slug);
      if (!tag) return null;
      try {
        const ids = await fetchTagProductIdsServer(tag.id);
        if (ids.length === 0) return null;
      } catch {
        return null;
      }
      return { label: l.label, href: `/product-tag/${tag.slug}/` };
    })
  );

  const seen = new Set<string>([selfPath]);
  const out: ResolvedLink[] = [];
  for (let i = 0; i < resolved.length; i++) {
    const r = resolved[i];
    if (!r) {
      console.warn(`[category-links] skipped "${links[i].label}" (${links[i].kind}:${links[i].slug}) - missing or empty`);
      continue;
    }
    if (seen.has(r.href)) continue;
    seen.add(r.href);
    out.push(r);
  }
  return out;
}
