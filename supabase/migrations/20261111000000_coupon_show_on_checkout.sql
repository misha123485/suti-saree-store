-- ============================================================
-- Coupons: admin toggle "Show on Checkout" -- controls which coupons
-- appear in the coupon banner / "View all coupons" list on /checkout.
--
-- Existing coupons keep today's behaviour: the checkout used to show
-- the coupons flagged "show on product page", so we copy that flag once.
-- ============================================================
ALTER TABLE coupons
  ADD COLUMN IF NOT EXISTS show_on_checkout boolean NOT NULL DEFAULT false;

UPDATE coupons SET show_on_checkout = show_on_product_page;
