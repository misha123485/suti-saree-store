-- ============================================================
-- Coupons: admin toggle "Show in Cart" -- controls which coupons are
-- listed in the side cart / shopping bag (Coupons & Offers section).
--
-- Existing coupons keep today's behaviour: the bag used to list the
-- coupons flagged "show on product page", so we copy that flag once.
-- ============================================================
ALTER TABLE coupons
  ADD COLUMN IF NOT EXISTS show_on_cart boolean NOT NULL DEFAULT false;

UPDATE coupons SET show_on_cart = show_on_product_page;
