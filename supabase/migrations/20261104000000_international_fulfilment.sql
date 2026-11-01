-- Phase 6: international fulfilment (additive only, India orders unaffected).
-- 1) orders.intl_dispatched_at: date the parcel left India (shown on export invoice / tracking).
-- 2) order_shipments.tracking_url + dispatched_at: external courier tracking link per parcel,
--    so international parcels (DHL/FedEx/Aramex/...) live in the same split-shipment table as Delhivery ones.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS intl_dispatched_at timestamptz;
ALTER TABLE order_shipments ADD COLUMN IF NOT EXISTS tracking_url text;
ALTER TABLE order_shipments ADD COLUMN IF NOT EXISTS dispatched_at timestamptz;
CREATE INDEX IF NOT EXISTS orders_is_international_created_idx ON orders (is_international, created_at);
