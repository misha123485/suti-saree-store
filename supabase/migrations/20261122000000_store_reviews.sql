-- ============================================================
-- Store ("shop") reviews -- reviews about the whole store, not one product.
-- Shown in the storefront "Reviews" popup under the "Store reviews" tab.
--
-- Public can only READ approved rows. Writes happen ONLY through
-- app/api/store-reviews (new reviews) and app/api/admin/store-reviews
-- (approve / hide / delete), both using the service role (bypasses RLS).
-- ============================================================

CREATE TABLE IF NOT EXISTS store_reviews (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name     text NOT NULL CHECK (char_length(btrim(customer_name)) >= 2),
  customer_email    text,
  rating            int  NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title             text,
  comment           text,
  is_approved       boolean NOT NULL DEFAULT false,
  verified_purchase boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS store_reviews_public_idx
  ON store_reviews (is_approved, verified_purchase DESC, created_at DESC);

ALTER TABLE store_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_approved_store_reviews" ON store_reviews;
CREATE POLICY "public_read_approved_store_reviews" ON store_reviews
  FOR SELECT TO anon, authenticated USING (is_approved = true);

-- Helps the "With photos" filter / ordering on the product reviews table.
CREATE INDEX IF NOT EXISTS reviews_public_order_idx
  ON reviews (is_approved, verified_purchase DESC, created_at DESC);
