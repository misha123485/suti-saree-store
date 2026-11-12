import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase-server';
import { fetchProductsServer } from '@/lib/products-api-server';
import { fetchShippingSettings } from '@/lib/pincode-api';
import { toPublicMediaUrls } from '@/lib/media-url';
import type { Product } from '@/lib/types';

// ChatGPT (OpenAI) product feed -- JSONL, one JSON object per line, one line per purchasable
// item (colour + size), following OpenAI's "Products" file-upload spec:
//   https://developers.openai.com/commerce/specs/file-upload/products
//
// URL:  https://<your-domain>/api/chatgpt-feed
//
// Built from the SAME data as /api/merchant-feed (Google), so price / stock / links always agree
// with the storefront. India only, INR. Checkout is NOT enabled (is_eligible_checkout=false):
// shoppers click through to the website and pay with Razorpay / Cashfree / COD as usual.
//
// Optional kill switch with no admin UI needed: set marketing_settings.chatgpt_feed_enabled=false.

export const dynamic = 'force-dynamic';

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.sutisaree.com').replace(/\/$/, '');

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

/** OpenAI wants plain-text descriptions (max ~5000 chars). */
function plainText(input: string): string {
  return (input || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function ensureColorMentioned(description: string, color: string): string {
  if (!color) return description;
  if (!description) return `Available in ${color}.`;
  if (description.toLowerCase().includes(color.toLowerCase())) return description;
  return `${description} Available in ${color}.`;
}

/** "1234.50 INR" -- major units, decimal point, 3-letter currency code. */
const money = (inr: number): string => `${inr.toFixed(2)} INR`;

const GENDERS = new Set(['male', 'female', 'unisex']);
const AGE_GROUPS = new Set(['newborn', 'infant', 'toddler', 'kids', 'adult']);

export async function GET() {
  const supabase = getServerSupabase();
  const { data: settingsRow } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'marketing_settings')
    .maybeSingle();

  const marketing =
    (settingsRow?.value as { chatgpt_feed_enabled?: boolean; merchant_feed_brand?: string }) || {};
  if (marketing.chatgpt_feed_enabled === false) {
    return new NextResponse('ChatGPT feed is disabled.', { status: 404 });
  }

  const brand = (marketing.merchant_feed_brand || 'Sutisaree').slice(0, 70);
  const products = await fetchProductsServer();
  const variantsByProduct = await fetchVariantsForFeed(products.map((p) => p.id));
  const shipping = await fetchShippingSettings();

  const lines: string[] = [];
  const usedItemIds = new Set<string>();
  const usedOptionKeys = new Set<string>();

  function pushRow(opts: {
    itemId: string;
    groupId: string | null;
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
    const { itemId, groupId, title, link, images: rawImages, inStock, price, mrp, color, size, product } = opts;

    // item_id must be unique, and (group_id, colour, size) must be unique within a group.
    if (usedItemIds.has(itemId)) return;
    const optionKey = `${groupId ?? itemId}|${color.toLowerCase()}|${size.toLowerCase()}`;
    if (usedOptionKeys.has(optionKey)) return;

    // image_url is required -- a row without one would be rejected, so skip it.
    const images = toPublicMediaUrls(rawImages).filter(Boolean) as string[];
    if (images.length === 0 || price <= 0) return;

    usedItemIds.add(itemId);
    usedOptionKeys.add(optionKey);

    // Same convention as the Google feed: if there is an MRP above the selling price,
    // `price` is the regular (MRP) price and `sale_price` is what the shopper actually pays.
    const onSale = !!mrp && mrp > price;

    const gender = GENDERS.has(product.gender) ? product.gender : 'female';
    const ageGroup = AGE_GROUPS.has(product.age_group) ? product.age_group : 'adult';

    const row: Record<string, unknown> = {
      item_id: itemId,
      title: title.slice(0, 150),
      description: ensureColorMentioned(plainText(product.description || product.name), color).slice(0, 5000),
      url: link,
      brand,
      seller_name: brand,
      image_url: images[0],
      availability: inStock ? 'in_stock' : 'out_of_stock',
      price: money(onSale ? (mrp as number) : price),
      is_eligible_search: true,
      is_eligible_checkout: false,
      condition: 'new',
      color,
      size,
      gender,
      age_group: ageGroup,
    };

    if (onSale) row.sale_price = money(price);
    if (images.length > 1) row.additional_image_urls = images.slice(1, 11);
    if (product.category) row.product_category = String(product.category);
    if (product.material) row.material = product.material;
    if (typeof shipping.flat_rate === 'number' && shipping.flat_rate >= 0) {
      row.shipping_price = money(shipping.flat_rate);
    }
    if (groupId) {
      row.group_id = groupId;
      row.listing_has_variations = true;
      row.variant_dict = { color, size };
    }

    lines.push(JSON.stringify(row));
  }

  for (const p of products) {
    const variants = variantsByProduct.get(p.id) ?? [];
    const defaultSize = (p.sizes || [])[0] || 'Free Size';

    // No colour variants recorded -> one plain item (no variant group).
    if (variants.length === 0) {
      pushRow({
        itemId: p.id,
        groupId: null,
        title: p.name,
        link: `${SITE_URL}/product/${p.slug}`,
        images: p.images || [],
        inStock: p.inStock && p.stock_quantity > 0,
        price: p.price,
        mrp: p.mrp,
        color: (p.colors || []).slice(0, 3).join('/') || 'Multicolor',
        size: defaultSize,
        product: p,
      });
      continue;
    }

    for (const v of variants) {
      const sizes = v.product_variant_sizes ?? [];
      const images = v.images && v.images.length > 0 ? v.images : p.images || [];

      if (sizes.length === 0) {
        pushRow({
          itemId: v.id,
          groupId: p.id,
          title: `${p.name} - ${v.color}`,
          link: `${SITE_URL}/product/${v.slug}`,
          images,
          inStock: p.inStock && p.stock_quantity > 0,
          price: v.price_override ?? p.price,
          mrp: p.mrp,
          color: v.color,
          size: defaultSize,
          product: p,
        });
        continue;
      }

      for (const s of sizes) {
        const sizeSlug = s.size.replace(/\s+/g, '').slice(0, 10);
        pushRow({
          itemId: `${v.id}-${sizeSlug}`,
          groupId: p.id,
          title: `${p.name} - ${v.color} - ${s.size}`,
          // ?size= pre-selects this size so the landing-page price matches the feed price.
          link: `${SITE_URL}/product/${v.slug}?size=${encodeURIComponent(s.size)}`,
          images,
          inStock: (s.stock_quantity || 0) > 0,
          price: s.price_override ?? v.price_override ?? p.price,
          mrp: p.mrp,
          color: v.color,
          size: s.size,
          product: p,
        });
      }
    }
  }

  return new NextResponse(lines.join('\n') + (lines.length ? '\n' : ''), {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'public, max-age=300, stale-while-revalidate=60',
    },
  });
}
