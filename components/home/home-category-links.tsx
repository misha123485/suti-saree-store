import Link from 'next/link';
import { fetchCategoriesServer } from '@/lib/products-api-server';
import { resolveHomeCategoryLinks } from '@/lib/home-category-links';

/** Server-rendered keyword links to the top categories (real <a href> in the first HTML). */
export default async function HomeCategoryLinks() {
  let links: ReturnType<typeof resolveHomeCategoryLinks> = [];
  try {
    links = resolveHomeCategoryLinks(await fetchCategoriesServer());
  } catch {
    links = [];
  }
  if (links.length === 0) return null;
  return (
    <section aria-labelledby="home-popular-categories" className="container-boutique py-10">
      <h2 id="home-popular-categories" className="font-serif text-2xl font-bold text-primary">
        Popular Saree Categories
      </h2>
      <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {links.map((l) => (
          <li key={l.href}>
            <Link
              href={l.href}
              className="block rounded-xl border border-border p-4 transition-shadow hover:shadow-md"
            >
              <span className="block font-semibold text-foreground">{l.anchor}</span>
              <span className="mt-1 block text-sm text-muted-foreground">{l.blurb}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
