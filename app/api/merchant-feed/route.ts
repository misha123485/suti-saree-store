import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase-server';
import { fetchProductsServer } from '@/lib/products-api-server';
import { fetchFulfillmentSettings } from '@/lib/marketing-api';
import { fetchShippingSettings } from '@/lib/pincode-api';
import { resolveGoogleProductCategory } from '@/lib/google-category';
import { toPublicMediaUrls } from '@/lib/media-url';
import type { Product } from '@/lib/types';
import { getPublicInternationalConfig } from '@/lib/intl-server';
import { convertInrToMinor, minorToMajor } from '@/lib/intl-pricing';
import { currencyDigits } from '@/lib/intl-shipping';
import type { InternationalSettings, ShippingZone } from '@/lib/intl-api';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.sutisaree.com';

// Without this, Next.js treats this route as static (no request params,
// no cookies/headers used) and bakes the response ONCE at build time --
// this was also *why* it originally failed to build (Next tries to
// prerender it). Forcing it dynamic means every request re-reads the
// live settings/products from Supabase, so changes made in Admin (GST &
// Shipping fee, Fulfillment Timing, product edits, etc.) show up on the
// very next fetch instead of only after the next deployment.
export const dynamic = 'force-dynamic';

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

// Google's "Update product descriptions" recommendation flags items whose
// <description> text never mentions an attribute (color, in this case)
// that IS present elsewhere on the item -- even though we already send
// <g:color>, Google specifically checks the free-text description too.
// Since the feed is one item per colour/size, we know the exact colour
// here, so we append it to the description whenever it isn't already
// mentioned in the text (case-insensitive match to avoid "Red, Red").
function ensureColorMentioned(description: string, color: string): string {
  if (!color) return description;
  const trimmed = description.trim();
  if (!trimmed) return `Available in ${color}.`;
  if (trimmed.toLowerCase().includes(color.toLowerCase())) return trimmed;
  return `${trimmed} Available in ${color}.`;
}

function escapeXml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Every color-variant row for the given products, each carrying its own
 *  per-size stock so we know whether *that specific color* is in stock --
 *  not just whether the parent product has stock in some other color. */
async function fetchVariantsForFeed(productIds: string[]): Promise<Map<string, FeedVariant[]>> {
  const byProduct = new Map<string, FeedVariant[]>();
  if (productIds.length === 0) return byProduct;

  const supabase = getServerSupabase();
  const { data, error } = await supabase
    .from('product_variants')
    .select('id, product_id, color, slug, images, price_override, product_variant_sizes(size, stock_quantity, price_override)')
    .in('product_id', productIds);
  if (error) throw error;

  for (const row of (data ?? []) as unknown as FeedVariant[]) {
    const list = byProduct.get(row.product_id) ?? [];
    list.push(row);
    byProduct.set(row.product_id, list);
  }
  return byProduct;
}

// Google Merchant Center / Meta Catalog compatible RSS 2.0 product feed.
// Add this URL as a "Scheduled fetch" in Google Merchant Center:
//   https://<your-domain>/api/merchant-feed
//
// One <item> per COLOR VARIANT (not one item per product): a product with
// 3 colors becomes 3 separate Shopping listings, each with its own link,
// images, and stock -- linked together via item_group_id so Google shows
// them as swatches/variants of the same product instead of duplicates.
//
// Phase 8 -- country feeds:
//   /api/merchant-feed                -> India, INR (unchanged)
//   /api/merchant-feed?country=US     -> United States, USD   (also AE, MY, AU, CA, OM, BH, QA, SA, KW, GB)
// A country feed only exists while International Selling is ON, that country is enabled AND covered by
// an active shipping zone; otherwise it answers 404. Prices use lib/intl-pricing.ts, i.e. the SAME
// formula the storefront and the order RPC use, so Google never sees a price different from the
// landing page. Every <g:link> carries ?cc=XX so the landing page opens in the same currency.
// One country = one feed = one currency: price, shipping and landing page currency always agree.
interface IntlFeedCtx {
  code: string;
  currency: string;
  settings: InternationalSettings;
  zone: ShippingZone;
}

export async function GET(request: Request) {
  const supabase = getServerSupabase();
  const { data: settingsRow } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'marketing_settings')
    .maybeSingle();

  const marketing = (settingsRow?.value as { merchant_feed_enabled?: boolean; merchant_feed_brand?: string }) || {};
  if (marketing.merchant_feed_enabled === false) {
    return new NextResponse('Merchant feed is disabled in Admin > Marketing.', { status: 404 });
  }

  // ---- Optional country variant (?country=XX). Anything but a valid, enabled, zoned country -> 404. ----
  const countryParam = (new URL(request.url).searchParams.get('country') || '').trim().toUpperCase();
  let intl: IntlFeedCtx | null = null;
  if (countryParam && countryParam !== 'IN') {
    const cfg = await getPublicInternationalConfig();
    const country = cfg.countries.find((c) => c.code === countryParam);
    const zone = cfg.zones.find((z) => z.countries.includes(countryParam));
    const hasRate = country ? (cfg.settings.fx_rates[country.currency] ?? 0) > 0 : false;
    if (!cfg.settings.international_enabled || !country || !zone || !hasRate) {
      return new NextResponse('International feed is not available for this country.', { status: 404 });
    }
    intl = { code: country.code, currency: country.currency, settings: cfg.settings, zone };
  }

  /** "1234.50 INR" for India; converted with the storefront formula for a country feed. */
  const money = (inr: number): string =>
    intl
      ? `${minorToMajor(convertInrToMinor(inr, intl.currency, intl.settings), intl.currency).toFixed(currencyDigits(intl.currency))} ${intl.currency}`
      : `${inr.toFixed(2)} INR`;

  const brand = marketing.merchant_feed_brand || 'Sutisaree';
  const products = await fetchProductsServer();
  const variantsByProduct = await fetchVariantsForFeed(products.map((p) => p.id));

  // Same numbers as Admin > Marketing > Shipping & Returns Timing / GST &
  // Shipping — declaring them here too means the feed can never say
  // something different from what the site itself tells a shopper, which
  // is exactly what Google Merchant Center checks for when it flags
  // shipping/returns misrepresentation.
  const [fulfillment, shipping] = await Promise.all([fetchFulfillmentSettings(), fetchShippingSettings()]);
  const indiaShippingBlock = `
      <g:shipping>
        <g:country>IN</g:country>
        <g:service>Standard</g:service>
        <g:price>${shipping.flat_rate.toFixed(2)} INR</g:price>
        <g:min_handling_time>${fulfillment.dispatch_days_min}</g:min_handling_time>
        <g:max_handling_time>${fulfillment.dispatch_days_max}</g:max_handling_time>
        <g:min_transit_time>${fulfillment.delivery_metro_min}</g:min_transit_time>
        <g:max_transit_time>${fulfillment.delivery_remote_max}</g:max_transit_time>
      </g:shipping>`;

  // Country feeds: ONE <g:shipping> block for that country, using the zone's rate converted to the
  // feed currency (same conversion as prices). The zone's free-shipping threshold is applied per item
  // price, and transit days come from the zone (omitted if the zone has none). Handling time is the
  // same dispatch window as everywhere else.
  function shippingFor(itemPriceInr: number): string {
    if (!intl) return indiaShippingBlock;
    const z = intl.zone;
    const free = z.free_shipping_threshold_inr > 0 && itemPriceInr >= z.free_shipping_threshold_inr;
    const transit =
      z.eta_min_days && z.eta_max_days
        ? `
        <g:min_transit_time>${z.eta_min_days}</g:min_transit_time>
        <g:max_transit_time>${z.eta_max_days}</g:max_transit_time>`
        : '';
    return `
      <g:shipping>
        <g:country>${escapeXml(intl.code)}</g:country>
        <g:service>${escapeXml(z.courier || 'International')}</g:service>
        <g:price>${money(free ? 0 : z.base_rate_inr)}</g:price>
        <g:min_handling_time>${fulfillment.dispatch_days_min}</g:min_handling_time>
        <g:max_handling_time>${fulfillment.dispatch_days_max}</g:max_handling_time>${transit}
      </g:shipping>`;
  }

  /** Adds ?cc=XX (or &cc=XX when a query string already exists) so the landing page shows the same currency. */
  const withCountry = (url: string): string =>
    intl ? `${url}${url.includes('?') ? '&' : '?'}cc=${encodeURIComponent(intl.code)}` : url;

  function renderItem(opts: {
    id: string;
    itemGroupId: string;
    title: string;
    link: string;
    images: string[];
    inStock: boolean;
    price: number;
    mrp: number | undefined | null;
    color: string;
    size: string;
    product: Product;
  }) {
    const { id, itemGroupId, title, link, images: rawImages, inStock, price, mrp, color, size, product } = opts;
    // Rewrites Supabase Storage URLs to our own domain (see lib/media-url.ts)
    // so Merchant Center and Pinterest's feed-derived catalog show
    // sutisaree.com image links instead of the storage provider's host.
    const images = toPublicMediaUrls(rawImages);
    const image = images[0] || '';
    const extraImages = images
      .slice(1, 11)
      .map((img) => `<g:additional_image_link>${escapeXml(img)}</g:additional_image_link>`)
      .join('');
    const availability = inStock ? 'in stock' : 'out of stock';
    const priceText = money(price);
    const salePrice = mrp && mrp > price ? `<g:sale_price>${priceText}</g:sale_price>` : '';
    const listedPrice = mrp && mrp > price ? money(mrp) : priceText;
    // No <g:tax> block on purpose: exports are supplied under LUT without IGST and the buyer pays
    // destination duties/VAT to the courier (DAP), so there is no tax for us to declare per item. If
    // Merchant Center ever asks for tax settings for a country, set them in the account, not here.
    const shipsFrom = intl ? `
      <g:ships_from_country>IN</g:ships_from_country>` : '';

    const gender = product.gender || 'female';
    const ageGroup = product.age_group || 'adult';
    const material = product.material ? `<g:material>${escapeXml(product.material)}</g:material>` : '';
    const pattern = product.pattern ? `<g:pattern>${escapeXml(product.pattern)}</g:pattern>` : '';

    return `
    <item>
      <g:id>${escapeXml(id)}</g:id>
      <g:item_group_id>${escapeXml(itemGroupId)}</g:item_group_id>
      <title>${escapeXml(title)}</title>
      <description>${escapeXml(ensureColorMentioned(product.description || product.name, color).slice(0, 5000))}</description>
      <link>${escapeXml(withCountry(link))}</link>
      <g:image_link>${escapeXml(image)}</g:image_link>
      ${extraImages}
      <g:availability>${availability}</g:availability>
      <g:price>${listedPrice}</g:price>
      ${salePrice}
      <g:brand>${escapeXml(brand)}</g:brand>
      <g:condition>new</g:condition>
      <g:product_type>${escapeXml(product.category)}</g:product_type>
      <g:google_product_category>${escapeXml(resolveGoogleProductCategory(product.category, product.name))}</g:google_product_category>
      <g:identifier_exists>false</g:identifier_exists>
      <g:color>${escapeXml(color)}</g:color>
      <g:size>${escapeXml(size)}</g:size>
      <g:gender>${escapeXml(gender)}</g:gender>
      <g:age_group>${escapeXml(ageGroup)}</g:age_group>
      ${material}
      ${pattern}${shipsFrom}
      ${shippingFor(price)}
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
          color: (p.colors || []).slice(0, 3).join('/') || 'Multicolor',
          size: (p.sizes || [])[0] || 'Free Size',
          product: p,
        });
      }

      // One item per SIZE within each colour variant (all sharing
      // item_group_id = product id, so Google groups every colour/size
      // combo as swatches of the same product). This used to be one item
      // per colour with every size squashed into a single "S/M/L/XL"
      // string and one flat price -- but sizes can each have their own
      // price_override now, and Google Merchant Center compares the price
      // in this feed against the price it actually finds on the landing
      // page. Sending one price for a bundle of sizes that don't all cost
      // the same is exactly what triggers "price mismatch" disapprovals,
      // so each size gets its own feed item with its own price and stock.
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
                size: (p.sizes || [])[0] || 'Free Size',
                product: p,
              }),
            ];
          }

          return sizes.map((s) => {
            const price = s.price_override ?? v.price_override ?? p.price;
            // Google Merchant Center caps the `id` attribute at 50
            // characters. v.id alone is a 36-char Supabase UUID, so we
            // only have ~13 chars of headroom to keep the size suffix
            // unique per colour without ever crossing that limit.
            const sizeSlug = s.size.replace(/\s+/g, '').slice(0, 10);
            // ?size= makes this item's landing page pre-select this exact
            // size on load (see product-detail.tsx), so the visible price
            // and structured-data price both match what's advertised here
            // -- without it, every size in this colour shares one URL that
            // always opens on the first size, and Google flags every other
            // size's price as a landing-page mismatch.
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
        .join('');
    })
    .join('');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>${escapeXml(brand)} Product Feed${intl ? ` (${intl.code})` : ''}</title>
    <link>${escapeXml(SITE_URL)}</link>
    <description>Product feed for Google Merchant Center / Meta Catalog</description>${items}
  </channel>
</rss>`;

  return new NextResponse(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=300, stale-while-revalidate=60',
    },
  });
}
