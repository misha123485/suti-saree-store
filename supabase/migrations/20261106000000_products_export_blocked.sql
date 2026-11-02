-- Per-product "do not export" flag (e.g. fragile / restricted / not yet priced for abroad).
-- Public-readable boolean on `products` is harmless (it only says "not sold abroad"). Writes stay service-role only
-- (existing products RLS), done from Admin > International P&L > Product costs. Default false => nothing changes.
ALTER TABLE products ADD COLUMN IF NOT EXISTS export_blocked boolean NOT NULL DEFAULT false;
