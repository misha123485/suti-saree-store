-- Admin-only: tracks "I ordered this customer's product from my supplier
-- (WhatsApp seller / Meesho)". Shape:
--   { "source": "whatsapp" | "meesho",
--     "ordered_on": "YYYY-MM-DD",
--     "meesho_order_id": "optional text",
--     "note": "optional text",
--     "updated_at": "<iso>" }
-- NULL = not ordered from the supplier yet. Plain nullable column, nothing
-- else is touched. Safe to run more than once.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS supplier_order jsonb;

COMMENT ON COLUMN orders.supplier_order IS
  'Admin-only supplier order tracking (WhatsApp / Meesho). Written only via /api/admin/orders/[id]/supplier-order (service role).';
