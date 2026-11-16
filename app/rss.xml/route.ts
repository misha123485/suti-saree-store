// app/rss.xml/route.ts
//
// Pinterest-compatible RSS/product feed for auto-publish + shopping (price) tags.
// Feed URL: https://www.sutisaree.com/rss.xml
//
// Uses the project's existing fetchProductsServer() (lib/products-api-server.ts),
// the same helper sitemap.ts uses, so this stays in sync with your real Supabase
// "products" table automatically -- no manual edits needed when products change.
//
// One <item> per COLOR + SIZE variant (not one item per product): a saree
// with 3 colors becomes 3 separate listings, and if a color has multiple
// sizes each size gets its own listing too -- all sharing g:item_group_id
// (= the parent product id) so Pinterest groups them as swatches of the
// same product instead of treating them as unrelated duplicates. This
// mirrors the variant logic already used in app/api/merchant-feed/route.ts
// for Google Merchant Center.
//
// UPDATE (Pinterest product-groups optimisation): every item now also carries
//   - g:brand, g:sale_price (only when a REAL mrp > selling price), gender/age_group/
//     material/pattern and up to 10 g:additional_image_link
//   - custom_label_0..4 so Pinterest Product Groups can be built with simple filters:
//       custom_label_0 = price band     (price_under_500 | price_500_999 | price_1000_1999 | price_2000_plus)
//       custom_label_1 = deal tier      (deal_40_plus | deal_20_39 | deal_upto_19 | regular_price)
//       custom_label_2 = occasion       (wedding | festive | party | daily_wear | ...)
//       custom_label_3 = fabric         (silk | cotton | georgette | linen | ...)
//       custom_label_4 = performance    (top_rated | new_arrival | standard)
//   - clean titles/descriptions (no HTML, emoji, ALL-CAPS or promo wording) to stay policy-safe
//
// FIX (2026-08-05): Added <enclosure> and <media:content> tags so Pinterest
// can find images in the feed. Pinterest's RSS crawler requires these standard
// image tags -- <g:image_link> alone is not picked up by the Pinterest RSS
// feed parser even though it works for Google Merchant Center.

import { fetchProductsServer } from "@/lib/products-api-server";
import { resolveGoogleProductCategory } from "@/lib/google-category";
import { getServerSupabase } from "@/lib/supabase-server";
import { toPublicMediaUrls } from "@/lib/media-url";
import type { Product } from "@/lib/types";

export const dynamic = "force-dynamic"; // always fetch fresh data on each request

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://www.sutisaree.com";

function escapeXml(unsafe: string = ""): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}


// ---------------------------------------------------------------------------
// Policy-safe text helpers (Pinterest rejects/limits spammy, ALL-CAPS or
// promotional titles & descriptions).
// ---------------------------------------------------------------------------
const PROMO_RE =
  /\b(free\s+shipping|free\s+delivery|cod\s+available|cash\s+on\s+delivery|best\s+price|lowest\s+price|cheapest|buy\s+now|shop\s+now|order\s+now|hurry|limited\s+(time|stock|offer)|sale|offer|discount|\d+\s*%\s*off|flat\s+\d+)\b/gi;
const EMOJI_RE = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu;

function stripHtml(input: string): string {
  return input
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toTitleCase(input: string): string {
  return input.toLowerCase().replace(/(^|[\s\-/(])([a-z])/g, (_m, a: string, b: string) => a + b.toUpperCase());
}

function cleanTitle(raw: string): string {
  let t = stripHtml(raw).replace(EMOJI_RE, "").replace(PROMO_RE, "").replace(/\s+/g, " ").replace(/\s+-\s*$/, "").trim();
  const letters = t.replace(/[^A-Za-z]/g, "");
  const upper = letters.replace(/[^A-Z]/g, "");
  if (letters.length > 8 && upper.length / letters.length > 0.6) t = toTitleCase(t); // no ALL CAPS
  if (t.length > 150) t = t.slice(0, 150).replace(/\s+\S*$/, "");
  return t;
}

function cleanDescription(raw: string, fallback: string): string {
  let d = stripHtml(raw).replace(EMOJI_RE, "").replace(PROMO_RE, "").replace(/\s+/g, " ").trim();
  const letters = d.replace(/[^A-Za-z]/g, "");
  const upper = letters.replace(/[^A-Z]/g, "");
  if (letters.length > 20 && upper.length / letters.length > 0.6) d = d.charAt(0) + d.slice(1).toLowerCase();
  if (d.length < 20) d = fallback; // Pinterest wants a meaningful description
  return d.slice(0, 5000);
}

function slugLabel(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
}

// Pinterest requires absolute http(s) image URLs. Some DB rows hold relative
// paths like /wp-content/uploads/... (served via next.config rewrite), so
// prefix them with SITE_URL.
function absUrl(u: string): string {
  if (!u) return "";
  if (/^https?:\/\//i.test(u)) return u;
  return SITE_URL.replace(/\/$/, "") + (u.startsWith("/") ? "" : "/") + u;
}

// Pinterest does not accept AVIF images. For our own /wp-content/ .avif files
// ask the site to serve a JPEG version (see app/api/wp-uploads route).
function pinterestSafeImage(u: string): string {
  if (!u) return u;
  const [path, query] = u.split("?");
  if (path.toLowerCase().endsWith(".avif") && path.startsWith(SITE_URL.replace(/\/$/, "") + "/wp-content/") && !query) {
    return path + "?fmt=jpg";
  }
  return u;
}

function imageMime(url: string): string {
  if (/[?&]fmt=jpg\b/.test(url)) return "image/jpeg";
  const u = url.split("?")[0].toLowerCase();
  if (u.endsWith(".avif")) return "image/avif";
  if (u.endsWith(".png")) return "image/png";
  if (u.endsWith(".jpg") || u.endsWith(".jpeg")) return "image/jpeg";
  if (u.endsWith(".gif")) return "image/gif";
  return "image/webp";
}

// ---------------------------------------------------------------------------
// Custom labels used to build Pinterest Product Groups
// ---------------------------------------------------------------------------
function priceBand(price: number): string {
  if (price < 500) return "price_under_500";
  if (price < 1000) return "price_500_999";
  if (price < 2000) return "price_1000_1999";
  return "price_2000_plus";
}

function dealTier(price: number, mrp: number | null | undefined): string {
  if (!mrp || mrp <= price) return "regular_price"; // never claim a discount that isn't real
  const pct = ((mrp - price) / mrp) * 100;
  if (pct >= 40) return "deal_40_plus";
  if (pct >= 20) return "deal_20_39";
  return "deal_upto_19";
}

const OCCASION_MAP: [RegExp, string][] = [
  [/wedding|bridal|marriage|shaadi/i, "wedding"],
  [/festiv|diwali|puja|pooja|navratri|durga|eid|karva/i, "festive"],
  [/party|cocktail|reception|evening/i, "party"],
  [/office|formal|work/i, "office_wear"],
  [/casual|daily|everyday|regular/i, "daily_wear"],
];
function occasionLabel(p: Product): string {
  const joined = (p.occasion || []).join(" ");
  if (!joined.trim()) return "daily_wear";
  for (const [re, label] of OCCASION_MAP) if (re.test(joined)) return label;
  return slugLabel(p.occasion[0]) || "daily_wear";
}

const FABRIC_KEYWORDS = [
  "banarasi", "kanjivaram", "kanchipuram", "tussar", "linen", "georgette", "chiffon", "organza",
  "crepe", "satin", "net", "velvet", "chanderi", "maheshwari", "bandhani", "patola", "silk", "cotton", "rayon",
];
function fabricLabel(p: Product): string {
  const text = `${p.fabric || ""} ${p.material || ""} ${p.name || ""}`.toLowerCase();
  for (const k of FABRIC_KEYWORDS) if (text.includes(k)) return k;
  return slugLabel(p.fabric || p.material || "") || "other";
}

function performanceLabel(p: Product): string {
  if ((p.rating || 0) >= 4.5 && (p.reviews || 0) >= 5) return "top_rated";
  if (p.created_at) {
    const ageDays = (Date.now() - new Date(p.created_at).getTime()) / 86_400_000;
    if (ageDays >= 0 && ageDays <= 30) return "new_arrival";
  }
  return "standard";
}

interface FeedVariantSize {
  size: string;
  stock_quantity: number;
  price_override: number | null;
}

interface FeedVariant {
  id: string;
  product_id: string;
  color: string;
  slug: string;
  images: string[] | null;
  price_override: number | null;
  product_variant_sizes: FeedVariantSize[] | null;
}

/** Every color-variant row for the given products, each carrying its own
 *  per-size stock so we know whether *that specific color* is in stock --
 *  not just whether the parent product has stock in some other color. */
async function fetchVariantsForFeed(productIds: string[]): Promise<Map<string, FeedVariant[]>> {
  const byProduct = new Map<string, FeedVariant[]>();
  if (productIds.length === 0) return byProduct;

  const supabase = getServerSupabase();
  const { data, error } = await supabase
    .from("product_variants")
    .select(
      "id, product_id, color, slug, images, price_override, product_variant_sizes(size, stock_quantity, price_override)"
    )
    .in("product_id", productIds);
  if (error) throw error;

  for (const row of (data ?? []) as unknown as FeedVariant[]) {
    const list = byProduct.get(row.product_id) ?? [];
    list.push(row);
    byProduct.set(row.product_id, list);
  }
  return byProduct;
}

export async function GET() {
  const products = await fetchProductsServer();
  const variantsByProduct = await fetchVariantsForFeed(products.map((p) => p.id));

  function renderItem(opts: {
    id: string;
    itemGroupId: string;
    title: string;
    link: string;
    images: string[];
    inStock: boolean;
    price: number;
    mrp: number | null | undefined;
    color: string;
    size: string;
    product: Product;
  }) {
    const { id, itemGroupId, title: rawTitle, link, images: rawImages, inStock, price, mrp, color, size, product } = opts;

    const images = toPublicMediaUrls(rawImages).map(absUrl).map(pinterestSafeImage).filter(Boolean);
    const image = images[0] || "";
    const extraImages = images
      .slice(1, 11)
      .map((img) => `<g:additional_image_link>${escapeXml(img)}</g:additional_image_link>`)
      .join("");

    // Pinterest needs <enclosure> and/or <media:content> to detect images;
    // <g:image_link> alone is ignored by the Pinterest RSS crawler.
    const mime = image ? imageMime(image) : "image/webp";
    const imageXml = image
      ? `
      <enclosure url="${escapeXml(image)}" type="${mime}" />
      <media:content url="${escapeXml(image)}" medium="image" type="${mime}" />`
      : "";

    const title = cleanTitle(rawTitle) || cleanTitle(product.name) || "Sutisaree Product";
    const description = cleanDescription(
      product.description || "",
      `${title}. ${product.fabric ? product.fabric + " " : ""}${product.category} from Sutisaree, available in ${color}.`
    );

    // Real discount only: price = MRP, sale_price = selling price (same logic as the Google feed,
    // so the advertised price always matches the landing page).
    const hasSale = !!mrp && mrp > price;
    const listedPrice = hasSale ? (mrp as number) : price;
    const salePrice = hasSale ? `\n      <g:sale_price>${price.toFixed(2)} INR</g:sale_price>` : "";

    const brand = product.highlights?.brand || "Sutisaree";
    const gender = product.gender || "female";
    const ageGroup = product.age_group || "adult";
    const material = product.material ? `\n      <g:material>${escapeXml(product.material)}</g:material>` : "";
    const pattern = product.pattern ? `\n      <g:pattern>${escapeXml(product.pattern)}</g:pattern>` : "";

    return `
    <item>
      <title>${escapeXml(title)}</title>
      <link>${escapeXml(link)}</link>
      <description>${escapeXml(description)}</description>
      <guid isPermaLink="false">${escapeXml(id)}</guid>${imageXml}
      <g:id>${escapeXml(id)}</g:id>
      <g:item_group_id>${escapeXml(itemGroupId)}</g:item_group_id>
      <g:title>${escapeXml(title)}</g:title>
      <g:description>${escapeXml(description)}</g:description>
      <g:link>${escapeXml(link)}</g:link>
      <g:image_link>${escapeXml(image)}</g:image_link>
      ${extraImages}
      <g:price>${listedPrice.toFixed(2)} INR</g:price>${salePrice}
      <g:availability>${inStock ? "in stock" : "out of stock"}</g:availability>
      <g:condition>new</g:condition>
      <g:brand>${escapeXml(brand)}</g:brand>
      <g:identifier_exists>false</g:identifier_exists>
      <g:product_type>${escapeXml(product.category)}</g:product_type>
      <g:google_product_category>${escapeXml(resolveGoogleProductCategory(product.category, product.name))}</g:google_product_category>
      <g:color>${escapeXml(color)}</g:color>
      <g:size>${escapeXml(size)}</g:size>
      <g:gender>${escapeXml(gender)}</g:gender>
      <g:age_group>${escapeXml(ageGroup)}</g:age_group>${material}${pattern}
      <g:custom_label_0>${priceBand(price)}</g:custom_label_0>
      <g:custom_label_1>${dealTier(price, mrp)}</g:custom_label_1>
      <g:custom_label_2>${escapeXml(occasionLabel(product))}</g:custom_label_2>
      <g:custom_label_3>${escapeXml(fabricLabel(product))}</g:custom_label_3>
      <g:custom_label_4>${performanceLabel(product)}</g:custom_label_4>
    </item>`;
  }

  const items = products
    .map((p) => {
      const variants = variantsByProduct.get(p.id) ?? [];

      // No colour variants recorded for this product yet -- fall back to
      // the single-item behaviour so nothing disappears from the feed.
      if (variants.length === 0) {
        return renderItem({
          id: p.id,
          itemGroupId: p.id,
          title: p.name,
          link: `${SITE_URL}/product/${p.slug}`,
          images: p.images || [],
          inStock: p.inStock && p.stock_quantity > 0,
          price: p.price,
          mrp: p.mrp,
          color: (p.colors || []).slice(0, 3).join("/") || "Multicolor",
          size: (p.sizes || [])[0] || "Free Size",
          product: p,
        });
      }

      // One item per SIZE within each colour variant (all sharing
      // item_group_id = product id, so Pinterest groups every colour/size
      // combo as swatches of the same product instead of separate items).
      return variants
        .flatMap((v) => {
          const sizes = v.product_variant_sizes ?? [];
          const images = v.images && v.images.length > 0 ? v.images : p.images || [];

          if (sizes.length === 0) {
            const price = v.price_override ?? p.price;
            return [
              renderItem({
                id: v.id,
                itemGroupId: p.id,
                title: `${p.name} - ${v.color}`,
                link: `${SITE_URL}/product/${v.slug}`,
                images,
                inStock: p.inStock && p.stock_quantity > 0,
                price,
                mrp: p.mrp,
                color: v.color,
                size: (p.sizes || [])[0] || "Free Size",
                product: p,
              }),
            ];
          }

          return sizes.map((s) => {
            const price = s.price_override ?? v.price_override ?? p.price;
            // Keeps each color/size combo's id unique and under length
            // limits, same approach as the Google Merchant feed.
            const sizeSlug = s.size.replace(/\s+/g, "").slice(0, 10);
            // ?size= pre-selects this exact size on the landing page so
            // the price shown there matches what's advertised here.
            const sizeLink = `${SITE_URL}/product/${v.slug}?size=${encodeURIComponent(s.size)}`;
            return renderItem({
              id: `${v.id}-${sizeSlug}`,
              itemGroupId: p.id,
              title: `${p.name} - ${v.color} - ${s.size}`,
              link: sizeLink,
              images,
              inStock: (s.stock_quantity || 0) > 0,
              price,
              mrp: p.mrp,
              color: v.color,
              size: s.size,
              product: p,
            });
          });
        })
        .join("");
    })
    .join("");

  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
  xmlns:g="http://base.google.com/ns/1.0"
  xmlns:media="http://search.yahoo.com/mrss/">
  <channel>
    <title>Sutisaree</title>
    <link>${SITE_URL}</link>
    <description>Latest products from Sutisaree</description>${items}
  </channel>
</rss>`;

  return new Response(rss, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
    },
  });
}
