import { getSupabaseBrowser } from './supabase-browser';

export async function fetchWishlistProductIds(): Promise<string[]> {
  const supabase = getSupabaseBrowser();
  const { data, error } = await supabase.from('wishlist').select('product_id');
  if (error) throw error;
  return (data ?? []).map((r) => r.product_id as string);
}

export type WishlistKey = { product_id: string; color: string };

export const normColor = (c?: string | null) => (c ?? '').trim().toLowerCase();

export async function fetchWishlistKeys(): Promise<WishlistKey[]> {
  const supabase = getSupabaseBrowser();
  const { data, error } = await supabase.from('wishlist').select('product_id, color');
  if (error) throw error;
  return (data ?? []).map((r) => ({
    product_id: r.product_id as string,
    color: normColor(r.color as string | null),
  }));
}

export async function fetchWishlistWithProducts() {
  const supabase = getSupabaseBrowser();
  const { data, error } = await supabase
    .from('wishlist')
    .select('id, created_at, products(*)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function addToWishlist(productId: string, color?: string | null) {
  const supabase = getSupabaseBrowser();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Please login to save items to your wishlist');

  const { error } = await supabase
    .from('wishlist')
    .insert({ product_id: productId, user_id: user.id, color: normColor(color) });
  if (error && error.code !== '23505') throw error; // ignore duplicate
}

export async function removeFromWishlist(productId: string, color?: string | null) {
  const supabase = getSupabaseBrowser();
  const { error } = await supabase
    .from('wishlist')
    .delete()
    .eq('product_id', productId)
    .eq('color', normColor(color));
  if (error) throw error;
}
