// Pure builder for the Product JSON-LD on /product/[slug] (Search Console > Product snippets and
// Merchant listings). No DB, no Next.js -> unit-tested in scripts/test-product-jsonld.ts and reused by
// scripts/audit-product-schema.ts so the audit checks EXACTLY what the page would publish.
//
// GUARANTEES
//  * `offers` always exists: price (number-string), priceCurrency INR, availability (never missing),
//    url, priceValidUntil (+1 year), validFrom, itemCondition, shippingDetails, hasMerchantReturnPolicy.
//    A product whose price is missing/0/NaN still gets an offer, but it is declared OutOfStock and
//    validateProductJsonLd() reports it (it cannot honestly be sold at an unknown price).
//  * `sku` is the SAME value as the product feed <g:id> of the exact colour+size shown (lib/feed-ids.ts).
//  * IRON RULE (README-FAKE-RATING-FIX.txt): `aggregateRating` and `review` are produced ONLY from real,
//    approved rows of the reviews table with rating 1-5. Zero reviews -> BOTH keys are absent (never a 0 / 4.5).
//    products.rating / products.reviews / variant.rating / variant.reviews are NOT used (they may be stale).
//  * image[] = absolute URLs of the ORIGINAL images (never -sm / -md thumbnails).
import { descriptionToPlainText } from './description-text';
import { feedOfferId } from './feed-ids';
import { toFeedImageUrls } from './feed-images';
import { sanitizeReviewText, sanitizeReviewerName, stripHtml } from './product-reviews-feed';
import { STORE_POLICY } from './store-policy';

export const MAX_JSONLD_REVIEWS = 10;
const MAX_DESCRIPTION = 5000;
const MAX_COLOR = 100;

/** A row of the `reviews` table (only the columns the schema needs). */
export interface JsonLdReviewRow {
  customer_name?: string | null;
  rating?: number | string | null;
  title?: string | null;
  comment?: string | null;
  created_at?: string | null;
  is_approved?: boolean | null;
}

export interface JsonLdVariantSize {
  size: string;
  stock_quantity: number;
  price_override?: number | null;
}

export interface ProductJsonLdInput {
  siteUrl: string;
  /** slug of the page being rendered (base product slug or colour-variant slug) */
  slug: string;
  /** ?size= of the request (only present on Merchant-feed style links) */
  sizeParam?: string | null;
  brand: string;
  displayName: string;
  /** plain text or HTML -- it is converted to plain text here */
  description?: string | null;
  product: {
    id: string;
    name: string;
    category?: string | null;
    colors?: string[] | null;
    images?: string[] | null;
    price: number;
    inStock: boolean;
    stock_quantity?: number | null;
    material?: string | null;
    fabric?: string | null;
    pattern?: string | null;
    created_at?: string | null;
  };
  variant?: {
    id: string;
    color?: string | null;
    images?: string[] | null;
    price_override?: number | null;
    sizes?: JsonLdVariantSize[] | null;
  } | null;
  /** every approved review row of the PRODUCT (all colours); unapproved / invalid ratings are ignored here too */
  reviews?: JsonLdReviewRow[] | null;
  /** Admin > Marketing > Shipping & Returns Timing / Shipping settings; India defaults are used when absent */
  fulfillment?: {
    dispatch_days_min: number;
    dispatch_days_max: number;
    delivery_metro_min: number;
    delivery_remote_max: number;
    return_window_days: number;
  } | null;
  shipping?: { flat_rate: number } | null;
  videoUrl?: string | null;
  videoThumbnails?: string[] | null;
  now?: Date;
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** Short single-line text without HTML (names, brand, colour, material). Unlike sanitizeReviewText it keeps digits. */
function plain(input: unknown, max: number): string {
  if (typeof input !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  const s = stripHtml(input).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/\s+/g, ' ').trim();
  return s.length > max ? s.slice(0, max).replace(/\s+\S*$/, '').trim() : s;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function plusOneYear(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear() + 1, d.getUTCMonth(), d.getUTCDate()));
}

function positive(n: unknown): number | null {
  const v = typeof n === 'string' ? parseFloat(n) : (n as number);
  return typeof v === 'number' && isFinite(v) && v > 0 ? v : null;
}

/** Plain-text, HTML-free, non-empty, <= 5000 chars. */
export function cleanSchemaDescription(raw: string | null | undefined, fallback: string): string {
  let s = descriptionToPlainText(raw)
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!s) s = fallback;
  if (s.length > MAX_DESCRIPTION) s = s.slice(0, MAX_DESCRIPTION).replace(/\s+\S*$/, '').trim();
  return s;
}

interface UsableReview {
  rating: number;
  time: number;
  date: string | null;
  authorName: string;
  name: string;
  body: string;
}

/** Real reviews only: approved, rating 1-5 (ratings are never rounded up / invented). */
function usableReviews(rows: JsonLdReviewRow[] | null | undefined): UsableReview[] {
  const out: UsableReview[] = [];
  for (let i = 0; i < (rows || []).length; i++) {
    const r = (rows as JsonLdReviewRow[])[i];
    if (!r || r.is_approved === false || r.is_approved === null) continue;
    const rating = typeof r.rating === 'string' ? parseFloat(r.rating) : r.rating;
    if (typeof rating !== 'number' || !isFinite(rating) || rating < 1 || rating > 5) continue;
    const t = r.created_at ? new Date(r.created_at) : null;
    const validDate = !!t && !isNaN(t.getTime());
    let body = sanitizeReviewText(r.comment);
    let name = sanitizeReviewText(r.title, 200);
    if (!body) { body = name; name = ''; }
    if (name && name.toLowerCase() === body.toLowerCase()) name = '';
    out.push({
      rating: rating,
      time: validDate ? (t as Date).getTime() : 0,
      date: validDate ? isoDate(t as Date) : null,
      authorName: sanitizeReviewerName(r.customer_name).name,
      name: name,
      body: body,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// builder
// ---------------------------------------------------------------------------

export function buildProductJsonLd(input: ProductJsonLdInput): Record<string, unknown> {
  const { product, variant } = input;
  const siteUrl = String(input.siteUrl || '').replace(/\/+$/, '');
  const now = input.now || new Date();
  const brandName = plain(input.brand, 70) || 'Sutisaree';
  const name = plain(input.displayName, 150) || plain(product.name, 150) || 'Product';

  // ----- which colour + size is on screen (same rule as product-detail.tsx: ?size= else first size) -----
  const sizes = ((variant && variant.sizes) || []).filter(function (s) { return !!s && typeof s.size === 'string'; });
  const wanted = (input.sizeParam || '').trim();
  const matched = wanted ? sizes.filter(function (s) { return s.size === wanted; })[0] : undefined;
  const selected = matched || sizes[0] || null;

  // ----- price / availability -----
  const price =
    positive(selected && selected.price_override) ||
    positive(variant && variant.price_override) ||
    positive(product.price);
  let inStock: boolean;
  if (selected) inStock = Number(selected.stock_quantity) > 0;
  else inStock = !!product.inStock && Number(product.stock_quantity) > 0; // same expression as /api/merchant-feed
  if (price === null) inStock = false; // no usable price -> cannot be offered as available

  // ----- ids / urls -----
  const sku =
    feedOfferId({
      productId: product.id,
      variantId: variant ? variant.id : null,
      size: variant && sizes.length > 0 && selected ? selected.size : undefined,
    }) || feedOfferId({ productId: product.id });

  const pageUrl = siteUrl + '/product/' + input.slug + (matched ? '?size=' + encodeURIComponent(matched.size) : '');

  // ----- shipping + returns (store settings; India defaults only when a setting is absent) -----
  const f = input.fulfillment;
  const flatRate =
    input.shipping && typeof input.shipping.flat_rate === 'number' && isFinite(input.shipping.flat_rate)
      ? input.shipping.flat_rate
      : STORE_POLICY.flatShippingRate;
  const returnDays = f && f.return_window_days > 0 ? f.return_window_days : STORE_POLICY.returnWindowDays;
  const freeReturn = (STORE_POLICY.returnCost as string) === 'Free';

  const offers: Record<string, unknown> = {
    '@type': 'Offer',
    url: pageUrl,
    priceCurrency: 'INR',
    price: (price === null ? 0 : price).toFixed(2),
    priceValidUntil: isoDate(plusOneYear(now)),
    validFrom: isoDate(now),
    availability: inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
    itemCondition: 'https://schema.org/NewCondition',
    seller: { '@type': 'Organization', name: 'Sutisaree' },
    shippingDetails: {
      '@type': 'OfferShippingDetails',
      shippingRate: { '@type': 'MonetaryAmount', value: flatRate, currency: 'INR' },
      shippingDestination: { '@type': 'DefinedRegion', addressCountry: 'IN' },
      deliveryTime: {
        '@type': 'ShippingDeliveryTime',
        handlingTime: {
          '@type': 'QuantitativeValue',
          minValue: f ? f.dispatch_days_min : STORE_POLICY.handlingMinDays,
          maxValue: f ? f.dispatch_days_max : STORE_POLICY.handlingMaxDays,
          unitCode: 'DAY',
        },
        transitTime: {
          '@type': 'QuantitativeValue',
          minValue: f ? f.delivery_metro_min : STORE_POLICY.transitMinDays,
          maxValue: f ? f.delivery_remote_max : STORE_POLICY.transitMaxDays,
          unitCode: 'DAY',
        },
      },
    },
    hasMerchantReturnPolicy: {
      '@type': 'MerchantReturnPolicy',
      applicableCountry: 'IN',
      returnPolicyCategory: 'https://schema.org/MerchantReturnFiniteReturnWindow',
      merchantReturnDays: returnDays,
      returnMethod: 'https://schema.org/ReturnByMail',
      returnFees: freeReturn ? 'https://schema.org/FreeReturn' : 'https://schema.org/ReturnShippingFees',
    },
  };

  // ----- images: original, absolute, de-duplicated (variant photos first when the colour has its own) -----
  const rawImages = variant && variant.images && variant.images.length > 0 ? variant.images : product.images || [];
  const images = toFeedImageUrls(rawImages, siteUrl).slice(0, 10);

  const colorRaw = ((variant && variant.color) || (product.colors && product.colors[0]) || '').toString();
  const color = plain(colorRaw, MAX_COLOR);

  const description = cleanSchemaDescription(input.description, name);
  const material = plain(product.material || product.fabric || '', 100);
  const pattern = plain(product.pattern || '', 100);

  const ld: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: name,
    description: description,
  };
  if (product.category) ld.category = product.category;
  if (color) ld.color = color;
  if (images.length > 0) ld.image = images;
  if (sku) ld.sku = sku;
  ld.brand = { '@type': 'Brand', name: brandName };
  ld.offers = offers;

  // ----- reviews: REAL approved rows only; zero -> neither aggregateRating nor review -----
  const real = usableReviews(input.reviews);
  if (real.length > 0) {
    let sum = 0;
    for (let i = 0; i < real.length; i++) sum += real[i].rating;
    ld.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: Math.round((sum / real.length) * 10) / 10,
      reviewCount: real.length,
      bestRating: 5,
      worstRating: 1,
    };
    ld.review = real
      .slice()
      .sort(function (a, b) { return b.time - a.time; })
      .slice(0, MAX_JSONLD_REVIEWS)
      .map(function (r) {
        const review: Record<string, unknown> = {
          '@type': 'Review',
          author: { '@type': 'Person', name: r.authorName },
          reviewRating: { '@type': 'Rating', ratingValue: r.rating, bestRating: 5, worstRating: 1 },
        };
        if (r.date) review.datePublished = r.date;
        if (r.name) review.name = r.name;
        if (r.body) review.reviewBody = r.body;
        return review;
      });
  }

  if (material) ld.material = material;
  if (pattern) ld.pattern = pattern;
  if (product.created_at) ld.productionDate = product.created_at;

  if (input.videoUrl) {
    const thumbs = toFeedImageUrls(input.videoThumbnails || [], siteUrl).slice(0, 1);
    const video: Record<string, unknown> = {
      '@type': 'VideoObject',
      name: name + ' - Video',
      description: description || 'Video showcase of ' + name,
      uploadDate: product.created_at || undefined,
      contentUrl: input.videoUrl,
    };
    if (thumbs.length > 0) video.thumbnailUrl = thumbs;
    ld.video = video;
  }
  return ld;
}

// ---------------------------------------------------------------------------
// validation (used by tests + scripts/audit-product-schema.ts)
// ---------------------------------------------------------------------------

/** Problems that make Product / Merchant-listing markup invalid. [] = valid. */
export function validateProductJsonLd(ld: Record<string, any> | null | undefined): string[] {
  const p: string[] = [];
  if (!ld) return ['no_jsonld'];
  const offers = ld.offers;
  if (!offers || typeof offers !== 'object') {
    p.push('no_offers');
  } else {
    const price = parseFloat(String(offers.price));
    if (!isFinite(price) || price <= 0) p.push('invalid_price');
    if (offers.priceCurrency !== 'INR') p.push('invalid_currency');
    if (offers.availability !== 'https://schema.org/InStock' && offers.availability !== 'https://schema.org/OutOfStock') {
      p.push('no_availability');
    }
    if (!offers.url) p.push('no_offer_url');
  }
  if (typeof ld.sku !== 'string' || ld.sku === '' || ld.sku.length > 50 || /[^A-Za-z0-9._-]/.test(ld.sku)) {
    p.push('invalid_sku');
  }
  if (!Array.isArray(ld.image) || ld.image.length === 0) p.push('no_image');
  if (typeof ld.description !== 'string' || ld.description.trim() === '') p.push('no_description');
  if (typeof ld.name !== 'string' || ld.name.trim() === '') p.push('no_name');
  if (ld.aggregateRating && !(ld.aggregateRating.reviewCount >= 1)) p.push('rating_without_reviews');
  if (ld.aggregateRating && !(ld.aggregateRating.ratingValue >= 1)) p.push('fake_or_zero_rating');
  if (ld.review && !ld.aggregateRating) p.push('review_without_aggregate');
  return p;
}
