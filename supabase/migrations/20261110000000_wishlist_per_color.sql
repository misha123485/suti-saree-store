-- Wishlist per colour: hearting one colour of a variation product must not
-- heart every colour. '' = product without colour variants (or legacy rows).
ALTER TABLE wishlist ADD COLUMN IF NOT EXISTS color text NOT NULL DEFAULT '';
ALTER TABLE wishlist DROP CONSTRAINT IF EXISTS wishlist_user_id_product_id_key;
ALTER TABLE wishlist ADD CONSTRAINT wishlist_user_id_product_id_color_key UNIQUE (user_id, product_id, color);
