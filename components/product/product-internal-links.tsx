import Link from 'next/link';
import { fetchCategoriesServer } from '@/lib/products-api-server';
import { categoryPath } from '@/lib/category-url';
import type { Product } from '@/lib/types';

/**
 * Server-rendered internal links for a product page (visible in the first HTML, real <a href>):
 *   - a link to the product's parent category page
 * The existing client-only "You may also like" block is untouched.
 */
export default async function ProductInternalLinks({ product }: { product: Product }) {
  if (!product.category) return null;

  let categoryHref: string | null = null;
  try {
    const cat = (await fetchCategoriesServer()).find((c) => c.name === product.category);
    if (cat) categoryHref = categoryPath(cat);
  } catch {
    categoryHref = null;
  }

  if (!categoryHref) return null;

  return (
    <section aria-label="More from this category" className="container-boutique py-8">
      {categoryHref && (
        <p className="text-sm text-muted-foreground">
          Category:{' '}
          <Link href={categoryHref} className="font-medium text-primary underline underline-offset-2">
            {product.category}
          </Link>
          {' · '}
          <Link href={categoryHref} className="underline underline-offset-2">
            View all {product.category}
          </Link>
        </p>
      )}
    </section>
  );
}
