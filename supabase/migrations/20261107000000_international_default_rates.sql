-- International: starter shipping rates + duty note (SAFE TO RE-RUN)
--
-- Fills ONLY boxes you have not touched yet:
--   * a zone is updated only if base, extra, free-shipping and minimum order are ALL still 0
--   * a country duty note is set only if it is still empty
-- Zones stay INACTIVE and the master switch is not touched, so nothing goes live.
-- These are estimates, NOT courier quotes. Replace with real DHL/Aramex rates from Admin > Settings > International Selling.
-- Shipping for one 700 g saree = base + extra, e.g. GCC 1300 + 500 = Rs 1800.
-- Export details (IEC, GSTIN, LUT, AD code, HS code) are legal numbers and are NOT seeded here.

UPDATE shipping_zones z
SET base_rate_inr               = v.base_rate,
    per_extra_500g_inr          = v.extra,
    free_shipping_threshold_inr = v.free_from,
    min_order_inr               = v.min_order,
    courier                     = COALESCE(NULLIF(trim(z.courier), ''), 'DHL Express'),
    updated_at                  = now()
FROM (VALUES
  ('GCC',          1300,  500, 15000, 4000),
  ('Malaysia',     1600,  600, 15000, 4000),
  ('USA / Canada', 2200,  900, 25000, 5000),
  ('Australia',    2200,  800, 25000, 5000)
) AS v(name, base_rate, extra, free_from, min_order)
WHERE z.name = v.name
  AND z.base_rate_inr = 0
  AND z.per_extra_500g_inr = 0
  AND z.free_shipping_threshold_inr = 0
  AND z.min_order_inr = 0;

-- Customer-facing duty/VAT note (shown at checkout). UK is left empty on purpose (UK VAT decision pending).
UPDATE intl_countries
SET vat_note = 'Import duty, VAT/GST and customs fees of your country are not included in the price. The courier or customs collects them from you on delivery.'
WHERE code IN ('US','AE','MY','OM','BH','QA','SA','KW','AU','CA')
  AND (vat_note IS NULL OR trim(vat_note) = '');
