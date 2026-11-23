// Pure (no DB / no Next.js) builder for the Google "Product reviews" feed, schema v2.3
//   https://developers.google.com/product-review-feeds/schema
//
// Kept separate from app/api/product-reviews-feed/route.ts so the exact same code can be
// unit-tested (scripts/test-product-reviews-feed.ts) and validated offline
// (scripts/validate-reviews-feed.ts).
//
// RULES (why this file exists -- Merchant Center > Reviews > Needs attention):
//  * Every <review> MUST carry a non-empty <product_ids> that matches the product feed
//    (/api/merchant-feed <g:id> + <g:brand>). A review with no resolvable id is SKIPPED, never emitted.
//  * Only tags defined in the v2.3 schema are emitted. No empty tags, no duplicates, no HTML in text.
//  * No personal data: e-mails, phone numbers, URLs, @handles and full names never reach the feed.
//  * Only REAL, approved customer reviews. A review without a valid 1-5 rating is skipped (never
//    "rounded up" to 1 star) -- see README-FAKE-RATING-FIX.txt, nothing here ever invents a rating.

export interface FeedReview {
  id: string;
  product_id: string;
  customer_name: string | null;
  rating: number | null;
  title: string | null;
  comment: string | null;
  created_at: string;
}

export interface FeedProduct {
  id: string;
  slug: string;
  name: string;
}

export interface FeedVariantForSkus {
  id: string;
  product_id: string;
  product_variant_sizes: { size: string }[] | null;
}

export type SkipReason =
  | 'unknown_product'
  | 'no_identifier'
  | 'invalid_rating'
  | 'invalid_date'
  | 'empty_content'
  | 'duplicate_review_id';

export interface BuildResult {
  xml: string;
  total: number;
  included: number;
  skipped: Record<SkipReason, number>;
}

export const MAX_SKUS_PER_PRODUCT = 200;
const MAX_SKU_LENGTH = 50; // Merchant Center caps an offer id at 50 chars
const MAX_CONTENT_LENGTH = 5000;
const MAX_TITLE_LENGTH = 200;

// ---------------------------------------------------------------------------
// Text sanitising
// ---------------------------------------------------------------------------

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  rsquo: "'", lsquo: "'", rdquo: '"', ldquo: '"', ndash: '-', mdash: '-', hellip: '...',
};

function decodeEntities(input: string): string {
  return input.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : ' ';
    }
    const v = NAMED_ENTITIES[e.toLowerCase()];
    return v === undefined ? m : v;
  });
}

/** Removes every HTML tag (also tags that were stored entity-encoded, e.g. "&lt;br /&gt;"). */
export function stripHtml(input: string): string {
  let s = String(input ?? '');
  // Legacy WooCommerce comments often contain <br />, <p>, and entity-encoded versions of them.
  // Decode first, then strip, twice, so "&lt;br&gt;" does not survive as escaped markup.
  for (let i = 0; i < 2; i++) {
    s = decodeEntities(s)
      .replace(/<\s*(script|style)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, ' ')
      .replace(/<\s*(br|\/p|\/div|\/li)\s*\/?\s*>/gi, ' ')
      .replace(/<\/?[a-z][^>]*>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ');
  }
  return s;
}

function dropLoneSurrogates(s: string): string {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const n = s.charCodeAt(i + 1);
      if (n >= 0xdc00 && n <= 0xdfff) { out += s[i] + s[i + 1]; i++; }
    } else if (!(c >= 0xdc00 && c <= 0xdfff)) {
      out += s[i];
    }
  }
  return out;
}

const EMAIL_RE = /[A-Z0-9._%+'-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)+/gi;
const URL_RE = /\b(?:https?:\/\/|ftp:\/\/|www\.)[^\s<>"']+/gi;
// bare domains such as "instagram.com/abc" or "sutisaree.in"
const BARE_DOMAIN_RE = /\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|in|co|net|org|shop|store|me|io|app|xyz|info|co\.in)\b(?:\/[^\s<>"']*)?/gi;
// +91 / 0091 / 91 prefixed Indian numbers, with or without separators
const PHONE_IN_PREFIX_RE = /(?:\+|\b00)?\s?91[\s().-]*[6-9](?:[\s().-]?\d){9}\b/g;
// 10 digit mobiles (optionally with leading 0): 98765 43210, 98765-43210, 9876543210
const PHONE_10_RE = /\b0?[6-9](?:[\s.-]?\d){9}\b/g;
// any other long digit run (landlines with STD code, other country codes, "+1 555 123 4567")
const PHONE_GENERIC_RE = /\+?\d(?:[\s().-]?\d){8,}/g;
const HANDLE_RE = /(^|[\s(])@[A-Za-z0-9._]{2,}/g;

/**
 * Cleans free text coming from a customer: strips HTML, e-mails, phone numbers, URLs and @handles,
 * removes control characters and collapses whitespace. Returns "" when nothing useful is left.
 */
export function sanitizeReviewText(input: string | null | undefined, maxLength = MAX_CONTENT_LENGTH): string {
  if (input == null) return '';
  let s = stripHtml(String(input));
  s = s
    .replace(EMAIL_RE, ' ')
    .replace(URL_RE, ' ')
    .replace(BARE_DOMAIN_RE, ' ')
    .replace(PHONE_IN_PREFIX_RE, ' ')
    .replace(PHONE_10_RE, ' ')
    .replace(PHONE_GENERIC_RE, ' ')
    .replace(HANDLE_RE, '$1 ')
    // characters that are illegal in XML 1.0 (+ lone surrogates)
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  s = dropLoneSurrogates(s);
  if (s.length > maxLength) s = s.slice(0, maxLength).replace(/\s+\S*$/, '').trim();
  return s;
}

/**
 * Reviewer name for the feed: FIRST NAME ONLY (never a surname), and "Anonymous" when the stored
 * name is empty or looks like an e-mail / phone / URL / handle. Applied to verified and unverified
 * buyers alike so a full name can never leak.
 */
export function sanitizeReviewerName(input: string | null | undefined): { name: string; anonymous: boolean } {
  const raw = String(input ?? '').trim();
  const looksLikeContact =
    /@/.test(raw) || /\d{4,}/.test(raw.replace(/[\s.-]/g, '')) || /https?:|www\./i.test(raw);
  if (!raw || looksLikeContact) return { name: 'Anonymous', anonymous: true };
  const cleaned = sanitizeReviewText(raw, 100)
    .replace(/[0-9_!#$%^&*()+=[\]{}|\\/:;"<>?,~`@]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const first = cleaned.split(' ')[0]?.replace(/^[.'-]+|[.'-]+$/g, '') ?? '';
  if (first.length < 2) return { name: 'Anonymous', anonymous: true };
  const name = first.charAt(0).toLocaleUpperCase() + first.slice(1);
  return { name: name.slice(0, 40), anonymous: false };
}

export function escapeXml(input: string): string {
  return String(input)
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ---------------------------------------------------------------------------
// Identifiers -- MUST mirror /api/merchant-feed (<g:id>)
// ---------------------------------------------------------------------------

/**
 * Every id the product feed (/api/merchant-feed) uses as <g:id> for this product:
 *   product with no variants  -> product id
 *   variant with no sizes     -> variant id
 *   variant with sizes        -> `${variant id}-${size without spaces, max 10 chars}`
 * The product id is ALSO included first: it is the feed's <g:item_group_id>, which Google uses to
 * share reviews between all colour/size variants of one product.
 * Returns [] when nothing usable exists (caller must then skip the review).
 */
export function buildProductSkus(productId: string, variants: FeedVariantForSkus[] | undefined): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (raw: string) => {
    const sku = String(raw ?? '').replace(/[\u0000-\u001F\u007F]/g, '').trim();
    if (!sku || sku.length > MAX_SKU_LENGTH || seen.has(sku)) return;
    seen.add(sku);
    out.push(sku);
  };
  add(productId);
  for (const v of variants ?? []) {
    const sizes = v.product_variant_sizes ?? [];
    if (sizes.length === 0) add(v.id);
    else for (const s of sizes) add(`${v.id}-${String(s.size ?? '').replace(/\s+/g, '').slice(0, 10)}`);
  }
  return out.slice(0, MAX_SKUS_PER_PRODUCT);
}

// ---------------------------------------------------------------------------
// Feed builder
// ---------------------------------------------------------------------------

export function toFeedTimestamp(value: string): string | null {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export function buildReviewsFeedXml(opts: {
  reviews: FeedReview[];
  productsById: Map<string, FeedProduct>;
  skusByProduct: Map<string, string[]>;
  brand: string;
  siteUrl: string;
  publisherName?: string;
}): BuildResult {
  const { reviews, productsById, skusByProduct, siteUrl } = opts;
  const brand = sanitizeReviewText(opts.brand, 70) || 'Sutisaree';
  const publisher = sanitizeReviewText(opts.publisherName ?? 'Sutisaree', 70) || 'Sutisaree';
  const skipped: Record<SkipReason, number> = {
    unknown_product: 0, no_identifier: 0, invalid_rating: 0, invalid_date: 0, empty_content: 0, duplicate_review_id: 0,
  };
  const seenIds = new Set<string>();
  const blocks: string[] = [];

  for (const r of reviews) {
    const p = productsById.get(r.product_id);
    if (!p || !p.slug) { skipped.unknown_product++; continue; }

    const skus = skusByProduct.get(p.id) ?? [];
    if (skus.length === 0) { skipped.no_identifier++; continue; }

    const ratingNum = Number(r.rating);
    if (!Number.isFinite(ratingNum) || ratingNum < 1 || ratingNum > 5) { skipped.invalid_rating++; continue; }
    const rating = Math.round(ratingNum);

    const ts = toFeedTimestamp(r.created_at);
    if (!ts) { skipped.invalid_date++; continue; }

    const reviewId = String(r.id ?? '').trim();
    if (!reviewId || seenIds.has(reviewId)) { skipped.duplicate_review_id++; continue; }

    let title = sanitizeReviewText(r.title, MAX_TITLE_LENGTH);
    let content = sanitizeReviewText(r.comment);
    if (!content) { content = title; title = ''; }
    if (!content) { skipped.empty_content++; continue; }
    if (title && title.toLowerCase() === content.toLowerCase()) title = '';

    seenIds.add(reviewId);
    const { name, anonymous } = sanitizeReviewerName(r.customer_name);
    const url = `${siteUrl.replace(/\/+$/, '')}/product/${p.slug}`;
    const productName = sanitizeReviewText(p.name, 150);

    blocks.push(`
    <review>
      <review_id>${escapeXml(reviewId)}</review_id>
      <reviewer>
        <name${anonymous ? ' is_anonymous="true"' : ''}>${escapeXml(name)}</name>
      </reviewer>
      <review_timestamp>${ts}</review_timestamp>${title ? `\n      <title>${escapeXml(title)}</title>` : ''}
      <content>${escapeXml(content)}</content>
      <review_url type="singleton">${escapeXml(url)}</review_url>
      <ratings>
        <overall min="1" max="5">${rating}</overall>
      </ratings>
      <products>
        <product>
          <product_ids>
            <skus>${skus.map((s) => `<sku>${escapeXml(s)}</sku>`).join('')}</skus>
            <brands><brand>${escapeXml(brand)}</brand></brands>
          </product_ids>${productName ? `\n          <product_name>${escapeXml(productName)}</product_name>` : ''}
          <product_url>${escapeXml(url)}</product_url>
        </product>
      </products>
    </review>`);
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:vc="http://www.w3.org/2007/XMLSchema-versioning"
      xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
      xsi:noNamespaceSchemaLocation="http://www.google.com/shopping/reviews/schema/product/2.3/product_reviews.xsd">
  <version>2.3</version>
  <publisher>
    <name>${escapeXml(publisher)}</name>
  </publisher>
  <reviews>${blocks.join('')}
  </reviews>
</feed>`;

  return { xml, total: reviews.length, included: blocks.length, skipped };
}
