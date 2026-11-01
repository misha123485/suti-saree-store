-- Phase 9: International profit & loss (additive only; India orders unaffected).
-- 1) product_costs: what each product costs YOU. The existing Safe Profit preview only keeps cost in the
--    admin's browser (localStorage) so there was no server-side cost to compute P&L from. This table is
--    ADMIN ONLY: RLS on, no policies, privileges revoked from anon/authenticated -> only the service role
--    (admin API routes) can read or write it. Never put cost on `products` (that table is public-read).
-- 2) orders.actual_settlement_inr: net INR Stripe actually paid out for this order (optional; when filled,
--    it replaces the estimated Stripe fee + FX loss in the P&L).
-- 3) orders.intl_ad_spend_inr: optional ad spend you allocate to this order.
CREATE TABLE IF NOT EXISTS product_costs (
  product_id text PRIMARY KEY,
  cost_inr   numeric(12, 2) NOT NULL CHECK (cost_inr >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE product_costs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON product_costs FROM anon, authenticated;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS actual_settlement_inr integer;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS intl_ad_spend_inr integer NOT NULL DEFAULT 0;
