-- Phase 5 (Stripe): record chargebacks on the order. Safe to re-run.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS stripe_dispute_id     text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS stripe_dispute_status text;
