import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase-server';
import { mapRowToProduct } from '@/lib/products-api-server';
import type { Product } from '@/lib/types';

// Resolves a Google Merchant Center feed item id (<g:id> from /api/merchant-feed)
// to the exact product / colour / size so /checkout-link/[id] can put that one
// item straight into checkout ("Buy Now" flow).
//
// Feed id shapes (see app/api/merchant-feed/route.ts):
//   <productId>              product without colour variants
//   <variantId>              colour variant without size rows
//   <variantId>-<sizeSlug>   colour variant + size (size with spaces removed, max 10 chars)
//
// Product shape handed back mirrors the `product` overlay in
// app/product/[slug]/product-detail.tsx, so the checkout page sees the same
// object it would after a normal Buy Now click on the product page.
export const dynamic = 'force-dynamic';

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const ID_RE = new RegExp(`^(${UUID})(?:-(.{1,10}))?$`, 'i');

const slugSize = (s: string) => s.replace(/\s+/g, '').slice(0, 10);

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const raw = decodeURIComponent(params.id || '').trim();
  const m = ID_RE.exec(raw);
  if (!m) return NextResponse.json({ error: 'Unknown item id' }, { status: 404 });
  const baseId = m[1].toLowerCase();
  const sizeSlug = m[2] ?? null;

  const supabase = getServerSupabase();

  // Both lookups run at the same time (one round-trip instead of two when the
  // id is a plain product); the product query is skipped for size-suffixed ids.
  const [{ data: variantRow }, { data: plainProductRow }] = await Promise.all([
    supabase
      .from('product_variants')
      .select('*, product_variant_sizes(*), products(*)')
      .eq('id', baseId)
      .maybeSingle(),
    sizeSlug
      ? Promise.resolve({ data: null as any })
      : supabase.from('products').select('*').eq('id', baseId).maybeSingle(),
  ]);

  // 1) Colour variant (with or without a size suffix)
  if (variantRow) {
    const { products: productRow, product_variant_sizes, ...v } = variantRow as any;
    if (!productRow) return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    const base: Product = mapRowToProduct(productRow);
    const sizes: { size: string; stock_quantity: number; price_override: number | null }[] = product_variant_sizes ?? [];

    let chosen = sizes.length ? sizes[0] : null;
    if (sizeSlug) {
      chosen = sizes.find((s) => slugSize(s.size) === sizeSlug) ?? null;
      if (!chosen) return NextResponse.json({ error: 'Size not found' }, { status: 404 });
    }

    const price = chosen?.price_override ?? v.price_override ?? base.price;
    const stock = chosen ? chosen.stock_quantity ?? 0 : base.stock_quantity;
    const product: Product = {
      ...base,
      slug: v.slug,
      price,
      images: v.images?.length ? v.images : base.images,
      video_url: v.video || base.video_url,
      colors: [v.color],
      sizes: sizes.length ? sizes.map((s) => s.size) : base.sizes,
      stock_quantity: stock,
      inStock: chosen ? stock > 0 : base.inStock && base.stock_quantity > 0,
    };
    return NextResponse.json({
      product,
      size: chosen?.size ?? base.sizes?.[0] ?? 'Free Size',
      feedItemId: raw,
    });
  }

  // 2) Plain product (no colour variants in the feed)
  if (!sizeSlug) {
    const productRow = plainProductRow;
    if (productRow) {
      const base = mapRowToProduct(productRow as any);
      return NextResponse.json({
        product: { ...base, inStock: base.inStock && base.stock_quantity > 0 },
        size: base.sizes?.[0] ?? 'Free Size',
        feedItemId: raw,
      });
    }
  }

  return NextResponse.json({ error: 'Item not found' }, { status: 404 });
}
