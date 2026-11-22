import { Metadata } from 'next';
import { productInCategory } from '@/lib/category-utils';
import { notFound, permanentRedirect, redirect } from 'next/navigation';
import Link from 'next/link';
import { fetchCategoriesServer, fetchProductsServer } from '@/lib/products-api-server';
import { fetchPopularityRankServer } from '@/lib/popularity-rank-server';
import { fetchTopVariantMapServer, toJSON } from '@/lib/top-variant-server';
import { getBlurPreviews } from '@/lib/blur-preview';
import { toPublicMediaUrl } from '@/lib/media-url';
import { categoryPath } from '@/lib/category-url';
import ViewItemListTracker from '@/components/analytics/view-item-list-tracker';
import CategoryToolbarGrid from '@/components/category/category-toolbar-grid';
import { safeJsonLd } from '@/lib/json-ld';
import { expandProductVariants } from '@/lib/expand-product-variants';
import { fetchCatalogListingSettings, DEFAULT_CATALOG_LISTING_SETTINGS } from '@/lib/settings-api';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.sutisaree.com';

// Old WooCommerce parent/umbrella categories that no longer exist as categories here
// (e.g. /product-category/sarees-online/page/6/). They used to rank, so send them to
// the shop with a 301 instead of a 404.
export const LEGACY_CATEGORY_SLUGS = new Set(['sarees-online', 'saree', 'women-clothing', 'clothing']);

/** Old WooCommerce format: page 1 = /product-category/x/, page N = /product-category/x/page/N/. */
export function categoryPagePath(basePath: string, page: number): string {
  return page > 1 ? `${basePath}page/${page}/` : basePath;
}

async function loadListingSettings() {
  try {
    return await fetchCatalogListingSettings();
  } catch {
    return DEFAULT_CATALOG_LISTING_SETTINGS;
  }
}

/**
 * Fallback intro copy, used only when the admin hasn't filled in the
 * category's own `description` field yet (Admin > Categories — that field
 * already existed, it just had no public page to render on until now).
 * Keeps every category page unique, indexable, and reasonably descriptive
 * out of the box; admins can override it any time with custom SEO copy.
 */
function fallbackIntro(name: string): string {
  return (
    `Explore our handpicked ${name} collection at Sutisaree. Every piece is sourced ` +
    `directly from master weavers across India, blending traditional craftsmanship with ` +
    `designs made for everyday elegance and special occasions alike. Whether you're shopping ` +
    `for a wedding, festival, or gifting, our ${name} collection is curated for quality, ` +
    `comfort, and timeless style — with new arrivals added regularly. Each product page has ` +
    `detailed fabric, care, and sizing information so you can shop with confidence.`
  );
}

export async function buildCategoryMetadata(slug: string, page: number): Promise<Metadata> {
  const [categories, products] = await Promise.all([
    fetchCategoriesServer(),
    fetchProductsServer(),
  ]);
  const category = categories.find((c) => c.slug === slug);

  if (!category) {
    return {
      title: 'Category not found | Sutisaree',
      robots: { index: false, follow: true },
    };
  }

  const description = (category.description || fallbackIntro(category.name)).slice(0, 160);
  const url = `${SITE_URL}${categoryPagePath(categoryPath(category), page)}`;
  // The root layout title template already appends " | Sutisaree" on pages that
  // set a plain title, but this file always spelled it out, so keep that style.
  const title = page > 1 ? `${category.name} - Page ${page} | Sutisaree` : `${category.name} | Sutisaree`;

  // An empty category ("No products yet") is thin content -- indexing it
  // risks a low-quality signal on the whole domain, and it's not a page
  // we want ranking anyway. noindex,follow keeps it crawlable (so links
  // out of it still pass equity) without submitting it to Google's index.
  // The page re-qualifies for indexing automatically the moment a product
  // is added, since this check runs fresh on every request/revalidation.
  const hasProducts = products.some((p) => productInCategory(p, category.name));

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: 'Sutisaree',
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
    robots: {
      index: hasProducts,
      follow: true,
      googleBot: { index: hasProducts, follow: true, 'max-image-preview': 'large' },
    },
  };
}

export async function CategoryView({ slug, page }: { slug: string; page: number }) {
  const [categories, products, initialPopularityRank, topVariantMap, listingSettings] = await Promise.all([
    fetchCategoriesServer(),
    fetchProductsServer(),
    fetchPopularityRankServer(),
    fetchTopVariantMapServer(),
    loadListingSettings(),
  ]);
  const initialTopVariants = toJSON(topVariantMap);

  const category = categories.find((c) => c.slug === slug);
  if (!category) {
    if (LEGACY_CATEGORY_SLUGS.has(slug)) permanentRedirect('/shop/');
    notFound();
  }

  const categoryProducts = products.filter((p) => productInCategory(p, category.name));
  const basePath = categoryPath(category);
  const pageSize = Math.max(1, listingSettings.page_size);
  const totalPages = Math.max(1, Math.ceil(categoryProducts.length / pageSize));
  // /page/1/ is the same page as the category URL itself; /page/999/ on a
  // 3-page category goes to the last real page instead of an empty soft-404.
  if (categoryProducts.length > 0 && page > totalPages) redirect(categoryPagePath(basePath, totalPages));
  // Same real per-image blur preview lookup as /shop (see app/shop/page.tsx
  // for the full explanation) — scoped to just this category's products.
  const cardImageUrls = new Set<string>();
  for (const p of categoryProducts) {
    const main = toPublicMediaUrl(p.default_variant_image || p.images[0]);
    const hover = toPublicMediaUrl(p.images[1]);
    if (main) cardImageUrls.add(main);
    if (hover) cardImageUrls.add(hover);
  }
  const blurPreviews = Object.fromEntries(await getBlurPreviews(Array.from(cardImageUrls)));
  // Counts every colour card the grid below actually renders (base colour
  // + each distinct `product_variants` colour), not just the number of
  // underlying product rows -- otherwise a single product with 10 colours
  // showed as "1 product" here while the grid rendered 10 cards for it.
  const displayCount = expandProductVariants(categoryProducts).length;
  const intro = category.description || fallbackIntro(category.name);
  const url = `${SITE_URL}${categoryPagePath(basePath, page)}`;

  // Same default order as the grid's "Popularity" sort, so the ItemList below
  // describes the products this page actually shows first.
  const ranked = [...categoryProducts].sort((a, b) => {
    const ra = initialPopularityRank.has(a.id) ? initialPopularityRank.get(a.id)! : Infinity;
    const rb = initialPopularityRank.has(b.id) ? initialPopularityRank.get(b.id)! : Infinity;
    if (ra !== rb) return ra - rb;
    return Number(!!b.featured) - Number(!!a.featured) || b.rating - a.rating;
  });
  const pageProducts = ranked.slice((page - 1) * pageSize, page * pageSize);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: category.name,
    description: intro,
    url,
    ...(categoryProducts.length > 0
      ? {
          mainEntity: {
            '@type': 'ItemList',
            itemListElement: pageProducts.map((p, i) => ({
              '@type': 'ListItem',
              position: (page - 1) * pageSize + i + 1,
              url: `${SITE_URL}/product/${p.slug}/`,
            })),
          },
        }
      : {}),
  };

  // Breadcrumb rich snippet: Home > {Category Name}.
  // Simplified to 2 levels (was Home > Categories > Category Name) so that
  // Google's SERP breadcrumb display shows the actual category name instead
  // of the generic "Categories" middle node when space is limited.
  // Purely a search-results enhancement (bigger, more clickable listing) --
  // doesn't change indexing eligibility, which is controlled by the
  // canonical + robots meta in generateMetadata() above.
  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: category.name, item: `${SITE_URL}${basePath}` },
    ],
  };

  return (
    <div className="container-boutique py-8 pb-24 md:pb-12">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(breadcrumbJsonLd) }}
      />

      <nav className="mb-4 text-xs text-muted-foreground">
        <Link href="/" className="hover:text-primary">
          Home
        </Link>
        {' / '}
        <Link href="/categories" className="hover:text-primary">
          Categories
        </Link>
        {' / '}
        <span className="text-foreground">{category.name}</span>
      </nav>

      {/* Visible title + description are rendered at the bottom of the page;
          this h1 stays as screen-reader/SEO-only text. */}
      <h1 className="sr-only">{category.name}</h1>
      <p className="mt-1 text-xs text-muted-foreground">
        {displayCount} {displayCount === 1 ? 'product' : 'products'}
      </p>

      {categoryProducts.length === 0 ? (
        <div className="mt-10 flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border py-20 text-center">
          <p className="font-serif text-lg font-semibold">No products yet</p>
          <p className="text-sm text-muted-foreground">
            Check back soon, or browse everything in Shop.
          </p>
          <Link href="/shop" className="mt-2 text-sm font-medium text-primary underline">
            Shop All
          </Link>
        </div>
      ) : (
        <CategoryToolbarGrid
          products={categoryProducts}
          categoryName={category.name}
          initialPopularityRank={initialPopularityRank}
          initialTopVariants={initialTopVariants}
          blurPreviews={blurPreviews}
          basePath={basePath}
          initialPage={page}
          initialListingSettings={listingSettings}
        />
      )}
      <section className="mt-10 border-t border-border/60 pt-8">
        <h2 className="font-serif text-3xl font-bold text-primary sm:text-4xl">{category.name}</h2>
        {page === 1 && (
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            {intro}
          </p>
        )}
      </section>
      <ViewItemListTracker
        listName={category.name}
        items={categoryProducts.map((p) => ({ id: p.id, name: p.name, category: p.category, price: p.price }))}
      />
    </div>
  );
}
