-- ============================================================
-- Store replies to customer reviews ("Reply from store").
--
-- Kept in its OWN table (not a column on `reviews`) on purpose: the
-- "customers_update_own_review" RLS policy lets a shopper UPDATE their own
-- review row, so a `store_reply` column there could be forged by the
-- shopper from the browser console. Here, anon/authenticated can only
-- READ; all writes go through app/api/admin/review-reply (service role,
-- admin-cookie gated), which bypasses RLS.
-- ============================================================

CREATE TABLE IF NOT EXISTS review_replies (
  review_id    uuid PRIMARY KEY REFERENCES reviews(id) ON DELETE CASCADE,
  product_id   uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  reply        text NOT NULL CHECK (char_length(btrim(reply)) > 0),
  replied_at   timestamptz NOT NULL DEFAULT now(),
  email_to     text,
  email_sent_at timestamptz
);

CREATE INDEX IF NOT EXISTS review_replies_product_idx ON review_replies (product_id);

ALTER TABLE review_replies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_review_replies" ON review_replies;
CREATE POLICY "public_read_review_replies" ON review_replies
  FOR SELECT TO anon, authenticated USING (true);

-- No INSERT/UPDATE/DELETE policy for anon/authenticated => denied.
-- The service role (admin API route) bypasses RLS.
