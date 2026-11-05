import { Heart } from 'lucide-react';
import Link from 'next/link';
import { getSupabaseServer, getCurrentUser } from '@/lib/supabase-server-auth';
import ProductCard from '@/components/product-card';
import type { Product, ProductRow } from '@/lib/types';

function mapRow(row: ProductRow): Product {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    category: (row.category_name as Product['category']) ?? 'Silk Sarees',
    price: row.price,
    mrp: row.mrp,
    description: row.description ?? '',
    fabric: row.fabric ?? '',
    origin: row.origin ?? '',
    colors: row.colors ?? [],
    sizes: row.sizes ?? [],
    occasion: row.occasion ?? [],
    gender: row.gender || 'female',
    age_group: row.age_group || 'adult',
    material: row.material ?? null,
    pattern: row.pattern ?? null,
    images: row.images ?? [],
    rating: row.rating,
    reviews: row.reviews,
    featured: row.featured,
    stock_quantity: row.stock_quantity,
    inStock: row.in_stock,
    created_at: row.created_at,
  };
}

export default async function WishlistPage() {
  const user = await getCurrentUser();
  const supabase = await getSupabaseServer();

  const { data } = await supabase
    .from('wishlist')
    .select('id, color, products(*)')
    .eq('user_id', user!.id)
    .order('created_at', { ascending: false });

  // One card per saved (product, colour). For a saved colour variant, swap in
  // that colour's own slug/photo so the card matches what was hearted.
  const rows = (data ?? []).filter((row: any) => row.products);
  const variantIds = Array.from(
    new Set(rows.filter((r: any) => r.color).map((r: any) => r.products.id as string)),
  );
  const { data: variantRows } = variantIds.length
    ? await supabase.from('product_variants').select('product_id, color, slug, images').in('product_id', variantIds)
    : { data: [] as any[] };

  const products = rows.map((row: any) => {
    const base = mapRow(row.products);
    const color = ((row.color as string) ?? '').trim();
    if (!color) return { product: base, key: base.id };
    const v = (variantRows ?? []).find(
      (x: any) => x.product_id === base.id && String(x.color).trim().toLowerCase() === color.toLowerCase(),
    );
    if (!v) return { product: base, key: `${base.id}-${color}` };
    return {
      key: `${base.id}-${color}`,
      product: {
        ...base,
        slug: v.slug,
        colors: [v.color],
        images: v.images?.length ? v.images : base.images,
      } as Product,
    };
  });

  return (
    <div>
      <h1 className="font-serif text-2xl font-bold text-primary">My Wishlist</h1>

      {products.length === 0 ? (
        <div className="mt-8 flex flex-col items-center gap-3 rounded-lg border border-dashed py-16 text-center text-muted-foreground">
          <Heart className="h-10 w-10" />
          <p>Nothing saved yet.</p>
          <Link href="/shop" className="text-sm font-medium text-primary hover:underline">
            Browse the collection
          </Link>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
          {products.map(({ product, key }) => (
            <ProductCard key={key} product={product} />
          ))}
        </div>
      )}
    </div>
  );
}
