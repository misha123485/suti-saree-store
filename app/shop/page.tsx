import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { fetchPopularityRankServer } from '@/lib/popularity-rank-server';
import type { TopVariantMapJSON } from '@/lib/top-variant-server';
import {
  loadShopCatalog,
  loadTopVariantsJSON,
  loadBlurPreviews,
  loadShopSettings,
  type ShopCatalog,
} from '@/lib/shop-data-cache';
import { safeJsonLd } from '@/lib/json-ld';
import ShopContent from './shop-content';
import ShopSeoContent, { getShopFaqs } from './shop-seo-content';

// Same reasoning as app/category/[slug]/page.tsx: this page has no
// generateStaticParams so it's dynamically rendered per-request by default,
// but `revalidate` still caches the underlying fetch/data for 60s at the
// route level, so most visits don't hit Supabase at all. Admin mutations
// call revalidatePath('/shop') for an instant purge when a product changes
// (see app/api/admin/products/[id]/route.ts) -- this is just the safety net.
// Vercel ISR-writes fix: 60 -> 300 (5 min).
export const revalidate = 86400; // 24h - CPU saver (was 6h); admin edits still purge via revalidatePath
// NOTE: /shop stays dynamic on purpose (it reads searchParams, and
// ShopContent uses useSearchParams). Making it static would put only the
// "Loading..." Suspense fallback into the HTML -- no products for crawlers.
// 1800 (not 300) keeps the cached Supabase data fresh for 30 min, which
// cuts Vercel ISR writes; admin product edits still purge it instantly via
// revalidatePath('/shop').

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.sutisaree.com').replace(/\/$/, '');
const SHOP_TITLE = 'Shop All Sarees & Ethnic Wear';
const SHOP_DESCRIPTION =
  'Buy handloom cotton, mulmul and silk sarees online at Sutisaree. Sourced directly from weavers across India, with free delivery and easy returns.';
// Search-result title (the page heading above stays SHOP_TITLE).
const SHOP_META_TITLE = 'Buy Handloom Sarees Online – Cotton, Mulmul & Silk';

// Old WooCommerce pagination format: /shop/ for page 1, /shop/page/2/ for page 2...
// (served by the rewrite in next.config.js, which maps it onto ?page=N internally).
function shopPagePath(page: number): string {
  return page > 1 ? `/shop/page/${page}/` : '/shop/';
}

function parsePage(raw: string | string[] | undefined): number {
  const v = Array.isArray(raw) ? raw[0] : raw;
  const n = parseInt(v ?? '1', 10);
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

// Each numbered page canonicalises to itself (page 1 = /shop/), which is what
// Google recommends for paginated listings. The root layout adds
// " | Sutisaree" to every title via its template, so it is NOT repeated here.
export async function generateMetadata({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}): Promise<Metadata> {
  const page = parsePage(searchParams?.page);
  const url = `${SITE_URL}${shopPagePath(page)}`;
  const title = page > 1 ? `${SHOP_META_TITLE} - Page ${page}` : SHOP_META_TITLE;
  return {
    title,
    description: SHOP_DESCRIPTION,
    alternates: { canonical: url },
    openGraph: {
      title: `${title} | Sutisaree`,
      description: SHOP_DESCRIPTION,
      url,
      siteName: 'Sutisaree',
      type: 'website',
    },
    twitter: { card: 'summary_large_image', title: `${title} | Sutisaree`, description: SHOP_DESCRIPTION },
    robots: {
      index: true,
      follow: true,
      googleBot: { index: true, follow: true, 'max-image-preview': 'large' },
    },
  };
}

export default async function ShopPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  // Text search now lives at its own URL (/search?q=...) instead of
  // /shop?q=... -- /shop is the pure category/filter browsing page. Any
  // old links, bookmarks, or shares still using /shop?q=... get sent
  // straight to /search with every other param (sort, category, etc.)
  // carried over untouched, so nothing that was shared before this change
  // breaks.
  if (searchParams?.q) {
    const forwarded = new URLSearchParams();
    for (const [key, value] of Object.entries(searchParams)) {
      if (value === undefined) continue;
      if (Array.isArray(value)) value.forEach((v) => forwarded.append(key, v));
      else forwarded.append(key, value);
    }
    redirect(`/search?${forwarded.toString()}`);
  }

  const page = parsePage(searchParams?.page);

  // If Supabase has a transient hiccup, fail soft (empty catalog + "no
  // products found" state) instead of throwing -- an unhandled throw here
  // would hit Next.js's default error screen.
  //
  // QUOTA FIX: every block below is served from Next's Data Cache
  // (see lib/shop-data-cache.ts), so bots hitting /shop/page/N no longer
  // trigger fresh Supabase queries on every request.
  let products: ShopCatalog['products'] = [];
  let categories: ShopCatalog['categories'] = [];
  let initialPopularityRank: Map<string, number> = new Map();
  let initialTopVariants: TopVariantMapJSON = {};
  let blurPreviews: Record<string, string> = {};
  try {
    const [catalog, popularityRes, topVariantsRes] = await Promise.all([
      loadShopCatalog(),
      fetchPopularityRankServer(),
      loadTopVariantsJSON(),
    ]);
    products = catalog.products;
    categories = catalog.categories;
    initialPopularityRank = popularityRes;
    initialTopVariants = topVariantsRes;
    // Real per-image blur previews (LQIP) for every product card. Any photo
    // without a preview simply falls back to the generic shimmer.
    blurPreviews = await loadBlurPreviews(products);
  } catch (err) {
    console.error('Failed to load /shop data:', err);
  }

  // Listing size + return window are tiny settings rows (cached 5 min).
  const { listingSettings, fulfillment } = await loadShopSettings();

  const pageSize = Math.max(1, listingSettings.page_size);
  const totalPages = Math.max(1, Math.ceil(products.length / pageSize));
  // ?page=999 on a 5-page catalog: send to the last real page instead of
  // serving an empty page that Google would index as a soft 404.
  if (products.length > 0 && page > totalPages) {
    redirect(shopPagePath(totalPages));
  }

  // Same default order as the grid's "Popular" sort (rank, then featured,
  // then rating), so the ItemList below describes the products this page
  // actually shows first.
  const ranked = [...products].sort((a, b) => {
    const ra = initialPopularityRank.has(a.id) ? initialPopularityRank.get(a.id)! : Infinity;
    const rb = initialPopularityRank.has(b.id) ? initialPopularityRank.get(b.id)! : Infinity;
    if (ra !== rb) return ra - rb;
    return Number(!!b.featured) - Number(!!a.featured) || b.rating - a.rating;
  });
  const pageProducts = ranked.slice((page - 1) * pageSize, page * pageSize);
  const pageUrl = `${SITE_URL}${shopPagePath(page)}`;

  const collectionJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: SHOP_TITLE,
    description: SHOP_DESCRIPTION,
    url: pageUrl,
    ...(pageProducts.length > 0
      ? {
          mainEntity: {
            '@type': 'ItemList',
            numberOfItems: products.length,
            itemListElement: pageProducts.map((p, i) => ({
              '@type': 'ListItem',
              position: (page - 1) * pageSize + i + 1,
              url: `${SITE_URL}/product/${p.slug}/`,
              name: p.name,
            })),
          },
        }
      : {}),
  };
  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: 'Shop', item: `${SITE_URL}/shop/` },
    ],
  };
  const faqs = getShopFaqs(fulfillment);
  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };

  // The grid never shows a product description and the browser has no use
  // for it on /shop, so it is dropped from the data sent to the client
  // (shorter HTML + less JavaScript to parse on a phone).
  const slimProducts = products; // descriptions already dropped in lib/shop-data-cache.ts

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(collectionJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(breadcrumbJsonLd) }} />
      {page === 1 && products.length > 0 && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(faqJsonLd) }} />
      )}
      <ShopContent
        products={slimProducts}
        categories={categories}
        initialPopularityRank={initialPopularityRank}
        initialTopVariants={initialTopVariants}
        blurPreviews={blurPreviews}
        initialPage={page}
        initialListingSettings={listingSettings}
      />
      {page === 1 && products.length > 0 && <ShopSeoContent categories={categories} faqs={faqs} />}
    </>
  );
}
