import Link from 'next/link';
import Image from 'next/image';
import { fetchCategoriesServer, fetchProductsByCategoryServer } from '@/lib/products-api-server';
import { categoryPath } from '@/lib/category-url';
import { toPublicMediaUrl } from '@/lib/media-url';
import type { Product } from '@/lib/types';

/**
 * Server-rendered internal links for a product page (visible in the first HTML, real <a href>):
 *   - a link to the product's parent category page
 *   - "Related products": 4 other live products from the same category
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

  let related: Product[] = [];
  try {
    related = await fetchProductsByCategoryServer(product.category, { limit: 4, excludeSlugs: [product.slug] });
  } catch {
    related = [];
  }

  if (!categoryHref && related.length === 0) return null;

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
      {related.length > 0 && (
        <div className="mt-4">
          <h2 className="font-serif text-xl font-semibold text-foreground sm:text-2xl">Related products</h2>
          <ul className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {related.map((p) => {
              const img = toPublicMediaUrl(p.images?.[0]) || p.images?.[0];
              return (
                <li key={p.id}>
                  <Link href={`/product/${p.slug}/`} className="group block">
                    <div className="relative aspect-[3/4] w-full overflow-hidden rounded-xl bg-muted">
                      {img && (
                        <Image
                          src={img}
                          alt={p.name}
                          fill
                          sizes="(max-width: 640px) 50vw, 25vw"
                          className="object-cover transition-transform duration-300 group-hover:scale-105"
                        />
                      )}
                    </div>
                    <span className="mt-2 line-clamp-2 block text-sm font-medium text-foreground">{p.name}</span>
                    <span className="block text-sm text-muted-foreground">
                      {'\u20B9'}
                      {Math.round(p.price).toLocaleString('en-IN')}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
