// Shared server-side rendering for the product page.
//
// Split out of page.tsx so the SAME markup/metadata/JSON-LD can be served by
// two routes (see next.config.js):
//   * app/product/[slug]/page.tsx       -- no searchParams => static ISR page
//                                          (served from cache, no function run)
//   * app/product-size/[slug]/page.tsx  -- only reached for /product/x?size=XL
//                                          (Google Merchant feed links), where
//                                          the JSON-LD price must match that
//                                          size's price.
// Keeping `searchParams` out of the main page is what lets Next.js cache it;
// reading searchParams makes a page dynamic (one function invocation per view).

import { descriptionToPlainText } from '@/lib/description-text';
import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ProductsProvider } from '@/lib/cart-context';
import { fetchProductBySlugServer, fetchCategoriesServer } from '@/lib/products-api-server';
import { fetchVariantBySlug, fetchVariantsForProductServer, VariantWithSizes, ProductVariant } from '@/lib/variants-api';
import { safeJsonLd } from '@/lib/json-ld';
import { categoryPath } from '@/lib/category-url';
import { fetchFulfillmentSettings } from '@/lib/marketing-api';
import { fetchShippingSettings } from '@/lib/pincode-api';
import { generateVariantSeoContent } from '@/lib/variant-seo-content';
import { getVariantDisplayName } from '@/lib/variant-display-name';
import { toPublicMediaUrl, toPublicMediaUrls } from '@/lib/media-url';
import { buildProductJsonLd } from '@/lib/product-jsonld';
import { fetchApprovedReviewsForSchema, fetchFeedBrand } from '@/lib/product-schema-server';
import { getBlurPreviews } from '@/lib/blur-preview';
import { getGalleryOverlaySettingsServer } from '@/lib/gallery-overlay-settings';
import ProductDetail from './product-detail';
import ProductInternalLinks from '@/components/product/product-internal-links';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.sutisaree.com';

/**
 * Resolves either a base product slug or an independent colour-variant
 * slug, returning enough info to build variant-specific SEO metadata.
 * Each variant gets its own title/description/canonical/OG image so it
 * can rank independently in search (e.g. "Red Banarasi Silk Saree" vs
 * "Blue Banarasi Silk Saree" as two distinct indexable pages).
 */
// Retries a flaky DB call (Supabase timeout etc.) before giving up, so a brief
// hiccup does not turn into a 5xx that Googlebot records as "Server error (5xx)".
async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, 250 * (i + 1)));
    }
  }
  throw lastErr;
}

async function resolveSeoTarget(slug: string) {
  const product = await withRetry(() => fetchProductBySlugServer(slug));
  if (product) return { product, variant: null as VariantWithSizes | null };

  const variantResult = await withRetry(() => fetchVariantBySlug(slug, true));
  if (!variantResult) return null;
  return { product: variantResult.product, variant: variantResult.variant };
}

export async function buildProductMetadata(slug: string): Promise<Metadata> {
  const resolved = await resolveSeoTarget(slug);

  if (!resolved) {
    return {
      title: 'Product not found | Sutisaree',
      description: 'The product you are looking for does not exist.',
      robots: { index: false, follow: true },
    };
  }

  const { product, variant } = resolved;
  // BUG FIX: this used to just append " - {colour}" onto product.name,
  // which duplicates the colour when it's already baked into the base
  // name (e.g. "Maroon Handloom Rayon Kurti with Palazzo - Steel Blue" --
  // both colours in one title). getVariantDisplayName swaps the base
  // product's own colour for the variant's instead. See
  // lib/variant-display-name.ts.
  const displayName = variant
    ? getVariantDisplayName(product?.name || '', product?.colors?.[0], variant.color)
    : product?.name || '';

  // BUG FIX: this used to fall back to `product.description` for every
  // colour variant that had no meta_description of its own — meaning every
  // colour of a product could ship the exact same <meta name="description">,
  // which reads as duplicate content to Google (a likely reason most
  // colour-variant URLs sat stuck as "Discovered - currently not indexed").
  // For a variant page, generate colour-specific fallback copy instead of
  // ever reusing the shared base-product description.
  const variantSeoFallback = variant
    ? generateVariantSeoContent({
        productName: product.name,
        fabric: product.fabric,
        category: product.category,
        occasion: product.occasion,
        color: variant.color,
      })
    : null;

  const title = variant?.meta_title || variantSeoFallback?.metaTitle || `${displayName} | Sutisaree`;
  const description =
    variant?.meta_description ||
    variantSeoFallback?.metaDescription ||
    descriptionToPlainText(product.description) ||
    `Buy ${displayName} - ${product.fabric} from ${product.origin}. Handwoven ethnic wear from Sutisaree.`;
  // Colour variants (/product/<variant-slug>/) stay reachable for shoppers, but the OLD
  // WooCommerce site had ONE indexed URL per product (variations never had their own page,
  // and were never in the sitemap). So a variant's canonical points to its PARENT product.
  // (Verified against the old DB backup: none of the 361 variant slugs was an old product.)
  const url = `${SITE_URL}/product/${variant ? product.slug : slug}/`;
  // Rewrites Supabase Storage URLs to sutisaree.com (see
  // lib/media-url.ts) so the OG/Twitter image -- what Google/social
  // crawlers actually fetch and cite -- shows our own domain.
  const images = toPublicMediaUrls(variant?.images.length ? variant.images : product.images);
  const image = images[0] || 'https://images.pexels.com/photos/1191349/pexels-photo-1191349.jpeg?auto=compress&cs=tinysrgb&w=1200&h=630&fit=crop';

  return {
    // absolute: the brand is already in `title`, so skip the layout's " | Sutisaree" template.
    title: { absolute: title },
    description,
    alternates: {
      canonical: url,
    },
    openGraph: {
      title,
      description,
      url,
      siteName: 'Sutisaree',
      images: [
        {
          url: image,
          width: 1200,
          height: 630,
          alt: displayName,
        },
      ],
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [image],
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        'max-image-preview': 'large',
      },
    },
  };
}

export async function ProductPageBody({ slug, size }: { slug: string; size?: string }) {
  const resolved = await resolveSeoTarget(slug);
  // Unknown / deleted product: answer with a real HTTP 404 (app/not-found.tsx)
  // instead of a 200 "Product not found" page, which Google reports as "Soft 404".
  if (!resolved) notFound();
  const product = resolved?.product ?? null;
  const variant = resolved?.variant ?? null;

  // ?size=XL comes from Merchant Center feed links (see app/api/merchant-feed/route.ts). The JSON-LD
  // builder (lib/product-jsonld.ts) resolves that exact size's price / stock / sku, so the structured data
  // always matches what was advertised for it. Falls back to the first size, exactly like the storefront does.
  const sizeParam = size?.trim();

  // Same source of truth as app/api/merchant-feed/route.ts (Admin >
  // Marketing > Shipping & Returns Timing) -- keeping this schema in sync
  // with the feed avoids a shipping/returns misrepresentation mismatch
  // between what's declared on-page vs to Google Merchant Center.
  const [fulfillment, shipping] = product
    ? await Promise.all([fetchFulfillmentSettings(), fetchShippingSettings()])
    : [null, null];

  // Same duplicate-content concern as generateMetadata() above -- a
  // variant's structured-data description shouldn't just repeat the base
  // product's shared text either.
  const jsonLdDescription = variant
    ? variant.meta_description ||
      [descriptionToPlainText(product?.description), variant.style_note].filter(Boolean).join(' ') ||
      descriptionToPlainText(product?.description)
    : descriptionToPlainText(product?.description);

  // Same colour-correct name as generateMetadata() above (this is a
  // separate function so it needs its own copy) -- avoids the base
  // product's own colour and the variant's colour both ending up in the
  // structured-data name.
  const displayName = product
    ? variant
      ? getVariantDisplayName(product.name, product.colors?.[0], variant.color)
      : product.name
    : '';

  // A colour variant's own video (if set) takes priority over the base
  // product's, matching the fallback used on the storefront itself (see
  // `video_url: variant.video || baseProduct.video_url` in product-detail.tsx).
  // Surfacing it as a VideoObject here is what lets Google treat this as
  // indexable video content (Search Console "Video" report / video search
  // results) -- without it, the <video> element is just on-page UI Google
  // has no structured signal for.
  // Rewritten to our own domain (see lib/media-url.ts) -- this is the
  // VideoObject.contentUrl/thumbnailUrl Google reads for Search Console's
  // "Video" report, so it should show sutisaree.com, not Supabase.
  const videoUrl = toPublicMediaUrl(variant?.video || product?.video_url || null);
  const videoThumbnails = toPublicMediaUrls((variant?.images.length ? variant.images : product?.images) || []);

  // Real per-image blur previews (LQIP) for the main gallery, fetched
  // server-side and passed down as a plain object (a Map doesn't survive
  // the server->client boundary). Any image not present in this object
  // simply has no real preview yet -- ProductGallery falls back to the
  // generic shimmer for those, so this can never produce a blank/broken
  // state. See lib/blur-preview.ts (Part 1) and components/product/
  // product-gallery.tsx (Part 2).
  const blurPreviews = Object.fromEntries(await getBlurPreviews(videoThumbnails));
  const galleryOverlays = await getGalleryOverlaySettingsServer();

  // Colour swatches, fetched here on the server (same query the browser used
  // to run after load) so they are part of the first HTML and the page
  // doesn't jump when they appear. A failure just means no swatches in the
  // first HTML -- the client component then falls back to its own fetch.
  let initialVariants: ProductVariant[] | undefined;
  if (product) {
    try {
      initialVariants = await fetchVariantsForProductServer(product.id);
    } catch {
      initialVariants = undefined;
    }
  }

  // REAL approved reviews only (reviews table, rating 1-5) -> aggregateRating + review[]. Zero rows -> neither
  // property is published. products.rating / products.reviews are deliberately NOT used (may be stale / fake).
  const [schemaReviews, schemaBrand] = product
    ? await Promise.all([fetchApprovedReviewsForSchema(product.id), fetchFeedBrand()])
    : [[], 'Sutisaree'];

  const jsonLd = product
    ? buildProductJsonLd({
        siteUrl: SITE_URL,
        slug,
        sizeParam,
        brand: schemaBrand,
        displayName,
        description: jsonLdDescription,
        product,
        variant,
        reviews: schemaReviews,
        fulfillment,
        shipping,
        videoUrl,
        videoThumbnails: videoThumbnails,
      })
    : null;

  // Breadcrumb's middle step must be the category's REAL URL (slug / old Woo
  // path from the categories table) -- a slug made from the name 404s.
  let breadcrumbCategoryUrl: string | null = null;
  let categoryHref: string | undefined;
  if (product?.category) {
    try {
      const cats = await fetchCategoriesServer();
      const match = cats.find((c) => c.name === product.category);
      if (match) {
        breadcrumbCategoryUrl = `${SITE_URL}${categoryPath(match)}`;
        categoryHref = categoryPath(match);
      }
    } catch {
      breadcrumbCategoryUrl = null;
    }
  }

  const breadcrumbJsonLd = product
    ? {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
          ...(breadcrumbCategoryUrl
            ? [
                {
                  '@type': 'ListItem',
                  position: 2,
                  name: product.category,
                  item: breadcrumbCategoryUrl,
                },
              ]
            : []),
          {
            '@type': 'ListItem',
            position: breadcrumbCategoryUrl ? 3 : 2,
            name: displayName,
            item: `${SITE_URL}/product/${product.slug}/`,
          },
        ],
      }
    : null;

  return (
    <>
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }}
        />
      )}
      {breadcrumbJsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: safeJsonLd(breadcrumbJsonLd) }}
        />
      )}
      <ProductsProvider>
        {/* `product`/`variant` were already fetched above (for the SEO
            metadata + JSON-LD block) -- pass them straight through as the
            client component's initial state instead of letting it discard
            this and re-fetch the same data itself in a useEffect. That
            duplicate client-side fetch was why the page painted a blank
            skeleton first and the main photo only started downloading
            after JS hydrated AND that second network round-trip finished --
            now the gallery (and its <Image priority>, which Next turns
            into a <link rel="preload">) is present in the very first HTML
            response, so the browser can start fetching the photo
            immediately in parallel with hydration. */}
        <ProductDetail
          initialProduct={product}
          initialVariant={variant}
          blurPreviews={blurPreviews}
          galleryOverlays={galleryOverlays}
          initialVariants={initialVariants}
          categoryHref={categoryHref}
        />
      </ProductsProvider>
      {product && <ProductInternalLinks product={product} />}
    </>
  );
}
