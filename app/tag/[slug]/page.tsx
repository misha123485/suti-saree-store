import { MIN_INDEXABLE_TAG_PRODUCTS } from '@/lib/tag-index';
import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import {
  fetchCategoriesServer,
  fetchProductsServer,
  fetchTagBySlugServer,
  fetchTagProductIdsServer,
} from '@/lib/products-api-server';
import { fetchPopularityRankServer } from '@/lib/popularity-rank-server';
import { fetchTopVariantMapServer, toJSON } from '@/lib/top-variant-server';
import { getBlurPreviews } from '@/lib/blur-preview';
import { toPublicMediaUrl } from '@/lib/media-url';
import ViewItemListTracker from '@/components/analytics/view-item-list-tracker';
import CategoryToolbarGrid from '@/components/category/category-toolbar-grid';
import { safeJsonLd } from '@/lib/json-ld';
import { BRAND_NAME, SITE_URL } from '@/lib/seo-site';
import { buildBreadcrumbJsonLd } from '@/lib/seo-jsonld';
import { buildTagSeo, TAG_EXPLORE_LINKS } from '@/lib/tag-seo';
import { resolveExploreLinks } from '@/lib/category-links';
import { ExploreLinks } from '@/components/category/category-seo-blocks';
import { expandProductVariants } from '@/lib/expand-product-variants';

export const revalidate = 86400; // 24h (was 30 min)

type Params = { params: { slug: string } };

async function getTagProducts(tagId: string) {
  const [products, ids] = await Promise.all([
    fetchProductsServer(),
    fetchTagProductIdsServer(tagId),
  ]);
  const idSet = new Set(ids);
  return products.filter((p) => idSet.has(p.id));
}

// Tag pages are NOT pre-rendered at build time. Every tag page loads the whole
// catalog from Supabase, so building hundreds of them at once overloaded the
// connection (EPIPE/ECONNRESET) and made deploys take 10+ minutes. Returning []
// keeps the page ISR: it renders on the first visit, is cached (revalidate
// below), and still purges via revalidatePath. dynamicParams stays true.
export async function generateStaticParams() {
  return [] as { slug: string }[];
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const tag = await fetchTagBySlugServer(params.slug);
  if (!tag) {
    return {
      title: `Tag not found | ${BRAND_NAME}`,
      robots: { index: false, follow: true },
    };
  }
  const tagProducts = await getTagProducts(tag.id);
  const hasProducts = tagProducts.length >= MIN_INDEXABLE_TAG_PRODUCTS;
  const seo = buildTagSeo(tag.name, tag.slug, tagProducts.length);
  const title = `${seo.title} | ${BRAND_NAME}`;
  const description = seo.description;
  const url = `${SITE_URL}/product-tag/${tag.slug}/`;
  return {
    // absolute: the brand is already in `title`, so skip the layout's brand template.
    title: { absolute: title },
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, siteName: BRAND_NAME, type: 'website' },
    twitter: { card: 'summary_large_image', title, description },
    robots: {
      index: hasProducts,
      follow: true,
      googleBot: { index: hasProducts, follow: true, 'max-image-preview': 'large' },
    },
  };
}

export default async function TagPage({ params }: Params) {
  const tag = await fetchTagBySlugServer(params.slug);
  if (!tag) notFound();

  const [tagProducts, initialPopularityRank, topVariantMap] = await Promise.all([
    getTagProducts(tag.id),
    fetchPopularityRankServer(),
    fetchTopVariantMapServer(),
  ]);
  const initialTopVariants = toJSON(topVariantMap);

  const cardImageUrls = new Set<string>();
  for (const p of tagProducts) {
    const main = toPublicMediaUrl(p.default_variant_image || p.images[0]);
    const hover = toPublicMediaUrl(p.images[1]);
    if (main) cardImageUrls.add(main);
    if (hover) cardImageUrls.add(hover);
  }
  const blurPreviews = Object.fromEntries(await getBlurPreviews(Array.from(cardImageUrls)));
  const displayCount = expandProductVariants(tagProducts).length;
  const url = `${SITE_URL}/product-tag/${tag.slug}/`;
  const seo = buildTagSeo(tag.name, tag.slug, tagProducts.length);
  const [allProducts, categories] = await Promise.all([fetchProductsServer(), fetchCategoriesServer()]);
  const exploreLinks = await resolveExploreLinks(TAG_EXPLORE_LINKS, categories, allProducts, `/product-tag/${tag.slug}/`);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: seo.h1,
    description: seo.intro,
    url,
    ...(tagProducts.length > 0
      ? {
          mainEntity: {
            '@type': 'ItemList',
            itemListElement: tagProducts.slice(0, 24).map((p, i) => ({
              '@type': 'ListItem',
              position: i + 1,
              url: `${SITE_URL}/product/${p.slug}/`,
            })),
          },
        }
      : {}),
  };
  const crumbs = [
    { name: 'Home', url: '/' },
    { name: tag.name, url: `/product-tag/${tag.slug}/` },
  ];
  const breadcrumbJsonLd = buildBreadcrumbJsonLd(crumbs);

  return (
    <div className="container-boutique py-8 pb-24 md:pb-12">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(breadcrumbJsonLd) }} />

      <nav aria-label="Breadcrumb" className="mb-4 text-xs text-muted-foreground">
        <Link href="/" className="hover:text-primary">Home</Link>
        {' / '}
        <span className="text-foreground" aria-current="page">{tag.name}</span>
      </nav>

      <h1 className="font-serif text-3xl font-bold text-primary sm:text-4xl">{seo.h1}</h1>
      <p className="mt-3 text-xs text-muted-foreground">
        {displayCount} {displayCount === 1 ? 'product' : 'products'}
      </p>

      {tagProducts.length === 0 ? (
        <div className="mt-10 flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border py-20 text-center">
          <p className="font-serif text-lg font-semibold">No products yet</p>
          <Link href="/shop" className="mt-2 text-sm font-medium text-primary underline">
            Shop All
          </Link>
        </div>
      ) : (
        <CategoryToolbarGrid
          products={tagProducts}
          categoryName={tag.name}
          initialPopularityRank={initialPopularityRank}
          initialTopVariants={initialTopVariants}
          blurPreviews={blurPreviews}
        />
      )}
      {/* Description now sits BELOW the products (still server-rendered, so crawlers read it). */}
      <section className="mt-8 rounded-2xl border border-border bg-card p-4 sm:p-6">
        <h2 className="font-serif text-xl font-bold text-primary sm:text-2xl">{seo.h1}</h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground sm:text-base">{seo.intro}</p>
        <p className="mt-3 text-xs text-muted-foreground">
          {displayCount} {displayCount === 1 ? 'product' : 'products'}
        </p>
      </section>
      {seo.tips && (
        <section className="mt-10 border-t border-border/60 pt-8">
          <h2 className="font-serif text-xl font-semibold text-foreground">Buying tips</h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground sm:text-base">{seo.tips}</p>
        </section>
      )}
      <ExploreLinks title="Explore more sarees" links={exploreLinks} />
      <ViewItemListTracker
        listName={tag.name}
        items={tagProducts.map((p) => ({ id: p.id, name: p.name, category: p.category, price: p.price }))}
      />
    </div>
  );
}
