import { Metadata } from 'next';
import { notFound, permanentRedirect, redirect } from 'next/navigation';
import { fetchCategoriesServer } from '@/lib/products-api-server';
import { categoryPath } from '@/lib/category-url';
import { CategoryView, buildCategoryMetadata, LEGACY_CATEGORY_SLUGS } from '../../category-view';

// Pages 2, 3, ... of a category. Reached at the old WooCommerce URL
// /product-category/<slug>/page/N/ through the rewrite in next.config.js.
// A real route segment (not ?page=N) keeps these pages cacheable (ISR) like page 1.
export const revalidate = 86400;

type Params = { params: { slug: string; n: string } };

function parseN(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 ? n : null;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const n = parseN(params.n);
  if (!n) return { robots: { index: false, follow: true } };
  return buildCategoryMetadata(params.slug, n);
}

export default async function CategoryPageN({ params }: Params) {
  const n = parseN(params.n);
  if (!n) notFound();
  if (n === 1) {
    // WooCommerce sent /page/1/ to the category URL itself.
    const categories = await fetchCategoriesServer();
    const category = categories.find((c) => c.slug === params.slug);
    if (!category) {
      if (LEGACY_CATEGORY_SLUGS.has(params.slug)) permanentRedirect('/shop/');
      notFound();
    }
    redirect(categoryPath(category));
  }
  return <CategoryView slug={params.slug} page={n} />;
}
