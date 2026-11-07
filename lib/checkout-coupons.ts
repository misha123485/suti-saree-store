import { supabase } from './supabase';
import type { Coupon } from './coupons-api';

/**
 * Coupons flagged "Show on checkout" in Admin > Coupons.
 * select('*') on purpose: works whether or not the show_on_checkout column
 * exists — if it doesn't, we fall back to the product-page flag so the box
 * never silently disappears.
 */
export async function fetchCheckoutCoupons(): Promise<Coupon[]> {
  const { data, error } = await supabase
    .from('coupons')
    .select('*')
    .eq('is_active', true)
    .order('discount_value', { ascending: false });
  if (error) throw error;

  const now = Date.now();
  return ((data ?? []) as Array<Coupon & { show_on_checkout?: boolean | null }>).filter((c) => {
    const visible = c.show_on_checkout ?? c.show_on_product_page;
    return (
      visible === true &&
      (!c.expires_at || new Date(c.expires_at).getTime() > now) &&
      (c.usage_limit === null || c.times_used < c.usage_limit)
    );
  });
}
