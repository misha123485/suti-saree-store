-- =====================================================================================
-- INTERNATIONAL ORDERS - PHASE 1: DATABASE FOUNDATION
--
-- RUN THIS in Supabase > SQL editor BEFORE deploying any storefront change.
-- Safe to run more than once. Everything international stays OFF until the admin
-- switches settings.international_settings.international_enabled to true.
--
-- WHAT THIS MIGRATION DOES
--  1) orders: new columns (country, charge currency/amount, fx, stripe ids, courier, P&L
--     inputs). All defaulted, so every existing row / India order is unaffected.
--  2) products.weight_grams (optional, nullable): used for the "extra per 500 g" shipping.
--  3) shipping_zones (admin managed): countries -> shipping rate, free threshold, ETA.
--  4) intl_countries (admin managed): which countries are enabled, currency, postal regex.
--  5) settings keys:
--       'international_settings' - public-read (storefront needs fx rates / flag), admin-write
--       'international_costs'    - ADMIN ONLY (stripe fee %, fixed fee) - hidden from anon
--       'export_details'         - ADMIN ONLY (IEC, GSTIN, LUT no.) - hidden from anon
--     The existing broad `anon_write_settings` policy is NOT touched. We AND it with
--     RESTRICTIVE policies for these keys only (same pattern as 20261030000000).
--  6) intl_inr_to_minor(): ONE SQL formula for INR -> foreign currency (minor units).
--  7) place_order_with_items(): copied from the NEWEST definition
--     (20261014000000_recovery_offer_stacking.sql; 20261024000000 does not redefine it)
--     and extended with an international branch. For country_code 'IN' (default) every
--     line of logic is unchanged.
--
-- INTERNATIONAL RULES ENFORCED IN THE RPC (never trusting the client)
--   * international_enabled must be true, country must be enabled in intl_countries
--   * payment_method must be 'online' (cod / partial rejected). Stripe is used by the app.
--   * online payment discount is NOT applied; GST = 0 (export under LUT)
--   * shipping is computed from shipping_zones (client shipping_charge is IGNORED)
--   * duty_notice_accepted must be true when duty_mode = 'DAP'
--   * postal code validated against intl_countries.postal_regex
--   * reseller orders are not allowed internationally
--   * orders.total_amount stays an INTEGER in INR; the amount the customer is charged is
--     stored in charge_amount_minor / charge_currency, converted with intl_inr_to_minor().
--   * fx_rate_used stores the EFFECTIVE INR per 1 unit of foreign currency after the
--     fx markup, i.e. fx_rates[cur] / (1 + fx_markup_percent/100).
-- =====================================================================================


-- 1) ORDERS -------------------------------------------------------------------------------
ALTER TABLE orders ADD COLUMN IF NOT EXISTS country_code            text    NOT NULL DEFAULT 'IN';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS is_international        boolean NOT NULL DEFAULT false;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS charge_currency         text    NOT NULL DEFAULT 'INR';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS charge_amount_minor     bigint;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS fx_rate_used            numeric(14,6);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS intl_shipping_inr       integer NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS duty_mode               text    NOT NULL DEFAULT 'DAP';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS duty_notice_accepted    boolean NOT NULL DEFAULT false;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS stripe_session_id       text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS intl_courier            text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS intl_awb                text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS intl_tracking_url       text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS export_hs_code          text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS actual_courier_cost_inr integer;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS actual_duty_paid_inr    integer;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_duty_mode_check') THEN
    ALTER TABLE orders ADD CONSTRAINT orders_duty_mode_check CHECK (duty_mode IN ('DAP', 'DDP'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_orders_country_code             ON orders (country_code);
CREATE INDEX IF NOT EXISTS idx_orders_stripe_session_id        ON orders (stripe_session_id)        WHERE stripe_session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_stripe_payment_intent_id ON orders (stripe_payment_intent_id) WHERE stripe_payment_intent_id IS NOT NULL;


-- 2) PRODUCTS: optional shipping weight ---------------------------------------------------
-- NULL = use international_settings.default_item_weight_grams.
ALTER TABLE products ADD COLUMN IF NOT EXISTS weight_grams integer;


-- 3) SHIPPING ZONES -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS shipping_zones (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                        text NOT NULL,
  countries                   text[] NOT NULL DEFAULT '{}',   -- ISO-2 codes
  base_rate_inr               integer NOT NULL DEFAULT 0 CHECK (base_rate_inr >= 0),   -- first 500 g
  per_extra_500g_inr          integer NOT NULL DEFAULT 0 CHECK (per_extra_500g_inr >= 0),
  free_shipping_threshold_inr integer NOT NULL DEFAULT 0 CHECK (free_shipping_threshold_inr >= 0), -- 0 = never free
  min_order_inr               integer NOT NULL DEFAULT 0 CHECK (min_order_inr >= 0),
  eta_min_days                integer,
  eta_max_days                integer,
  courier                     text,
  is_active                   boolean NOT NULL DEFAULT true,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE shipping_zones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "shipping_zones_public_select" ON shipping_zones;
CREATE POLICY "shipping_zones_public_select" ON shipping_zones FOR SELECT
  TO anon, authenticated USING (is_active);

DROP POLICY IF EXISTS "shipping_zones_service_all" ON shipping_zones;
CREATE POLICY "shipping_zones_service_all" ON shipping_zones FOR ALL
  TO service_role USING (true) WITH CHECK (true);

-- Writes: only through the admin API (service role). No anon/authenticated write policy exists,
-- and we also drop the table-level write privileges as a second lock.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON shipping_zones FROM anon, authenticated;

-- Placeholder zones (INACTIVE, rates 0) so the admin only has to fill real courier rates.
INSERT INTO shipping_zones (name, countries, is_active, eta_min_days, eta_max_days)
SELECT v.name, v.countries, false, v.eta_min, v.eta_max
FROM (VALUES
  ('GCC',            ARRAY['AE','OM','BH','QA','SA','KW'], 4,  8),
  ('Malaysia',       ARRAY['MY'],                          5, 10),
  ('USA / Canada',   ARRAY['US','CA'],                     7, 14),
  ('Australia',      ARRAY['AU'],                          7, 14)
) AS v(name, countries, eta_min, eta_max)
WHERE NOT EXISTS (SELECT 1 FROM shipping_zones);


-- 4) INTERNATIONAL COUNTRIES --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS intl_countries (
  code           text PRIMARY KEY,          -- ISO-2
  name           text NOT NULL,
  currency       text NOT NULL,             -- ISO-4217
  postal_regex   text,                      -- NULL = free text / no postcode
  requires_state boolean NOT NULL DEFAULT false,
  is_enabled     boolean NOT NULL DEFAULT false,
  sort           integer NOT NULL DEFAULT 0,
  vat_note       text,                      -- shown to customers (e.g. "5% VAT payable on delivery")
  notes          text                       -- INTERNAL admin notes (not readable by anon)
);

ALTER TABLE intl_countries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "intl_countries_public_select" ON intl_countries;
CREATE POLICY "intl_countries_public_select" ON intl_countries FOR SELECT
  TO anon, authenticated USING (is_enabled);

DROP POLICY IF EXISTS "intl_countries_service_all" ON intl_countries;
CREATE POLICY "intl_countries_service_all" ON intl_countries FOR ALL
  TO service_role USING (true) WITH CHECK (true);

REVOKE ALL ON intl_countries FROM anon, authenticated;
-- Column-level grant: internal `notes` stays hidden from the public API.
GRANT SELECT (code, name, currency, postal_regex, requires_state, is_enabled, sort, vat_note)
  ON intl_countries TO anon, authenticated;

INSERT INTO intl_countries (code, name, currency, postal_regex, requires_state, is_enabled, sort, notes) VALUES
  ('US', 'United States',        'USD', '^\d{5}(-\d{4})?$',                         true,  false,  1, 'Wave 1. Re-verify US tariff / de-minimis rules before enabling.'),
  ('AE', 'United Arab Emirates', 'AED', NULL,                                       false, false,  2, 'Wave 1.'),
  ('MY', 'Malaysia',             'MYR', '^\d{5}$',                                  false, false,  3, 'Wave 1.'),
  ('OM', 'Oman',                 'OMR', '^\d{3}$',                                  false, false,  4, 'Wave 2.'),
  ('BH', 'Bahrain',              'BHD', '^\d{3,4}$',                                false, false,  5, 'Wave 2.'),
  ('QA', 'Qatar',                'QAR', NULL,                                       false, false,  6, 'Wave 2.'),
  ('SA', 'Saudi Arabia',         'SAR', '^\d{5}(-\d{4})?$',                         false, false,  7, 'Wave 2.'),
  ('KW', 'Kuwait',               'KWD', '^\d{5}$',                                  false, false,  8, 'Wave 2.'),
  ('AU', 'Australia',            'AUD', '^\d{4}$',                                  true,  false,  9, 'Wave 2.'),
  ('CA', 'Canada',               'CAD', '^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$',    true,  false, 10, 'Wave 2.'),
  ('GB', 'United Kingdom',       'GBP', '^[A-Za-z]{1,2}\d[A-Za-z\d]? ?\d[A-Za-z]{2}$', false, false, 11, 'Enable ONLY after the UK VAT registration decision.')
ON CONFLICT (code) DO NOTHING;


-- 5) SETTINGS KEYS ------------------------------------------------------------------------
-- 5a) Block anon / logged-in customers from writing these keys (RESTRICTIVE = AND-ed with the
--     existing permissive anon_write_settings policy, which we do not touch).
DROP POLICY IF EXISTS "intl_settings_block_insert" ON settings;
DROP POLICY IF EXISTS "intl_settings_block_update" ON settings;
DROP POLICY IF EXISTS "intl_settings_block_delete" ON settings;

CREATE POLICY "intl_settings_block_insert" ON settings AS RESTRICTIVE FOR INSERT
  TO anon, authenticated
  WITH CHECK (key NOT IN ('international_settings', 'international_costs', 'export_details'));
CREATE POLICY "intl_settings_block_update" ON settings AS RESTRICTIVE FOR UPDATE
  TO anon, authenticated
  USING      (key NOT IN ('international_settings', 'international_costs', 'export_details'))
  WITH CHECK (key NOT IN ('international_settings', 'international_costs', 'export_details'));
CREATE POLICY "intl_settings_block_delete" ON settings AS RESTRICTIVE FOR DELETE
  TO anon, authenticated
  USING (key NOT IN ('international_settings', 'international_costs', 'export_details'));

-- 5b) Hide the secret-ish keys from anon SELECT. RESTRICTIVE again, so the existing
--     anon_select_settings policy (and its own exclusion list) is left exactly as it is.
DROP POLICY IF EXISTS "intl_settings_hide_secrets" ON settings;
CREATE POLICY "intl_settings_hide_secrets" ON settings AS RESTRICTIVE FOR SELECT
  TO anon, authenticated
  USING (key NOT IN ('international_costs', 'export_details'));

-- 5c) Defaults (editable from Admin; ON CONFLICT keeps anything already saved).
INSERT INTO settings (key, value) VALUES
  ('international_settings', '{
     "international_enabled": false,
     "fx_markup_percent": 2.0,
     "fx_rates": {"USD": 90, "AED": 24.5, "GBP": 115, "MYR": 20, "AUD": 58, "CAD": 65,
                  "OMR": 235, "BHD": 240, "QAR": 24.7, "SAR": 24, "KWD": 295},
     "intl_price_markup_percent": 0,
     "price_rounding": "x.99",
     "default_duty_mode": "DAP",
     "return_window_days_intl": 7,
     "default_item_weight_grams": 700
   }'::jsonb),
  ('international_costs', '{"stripe_fee_percent": 3.0, "stripe_fixed_fee_inr": 0}'::jsonb),
  ('export_details',      '{"iec": "", "gstin": "", "lut_number": "", "lut_date": "", "ad_code": "", "default_hs_code": ""}'::jsonb)
ON CONFLICT (key) DO NOTHING;


-- 6) ONE FORMULA: INR -> foreign currency minor units -------------------------------------
--   effective_rate = fx_rate / (1 + fx_markup/100)        (INR per 1 foreign unit)
--   foreign        = inr / effective_rate
--   rounding 'x.99': 2-decimal currencies -> next whole unit minus 0.01
--                    3-decimal (OMR/BHD/KWD) -> next 0.05
--   rounding 'x.00': next whole unit      | anything else: next minor unit
-- Stripe requires 3-decimal amounts to be divisible by 10; every branch below is.
CREATE OR REPLACE FUNCTION intl_inr_to_minor(
  p_inr      numeric,
  p_currency text,
  p_rate     numeric,
  p_markup   numeric,
  p_rounding text
) RETURNS bigint
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_eff numeric;
  v_foreign numeric;
  v_three boolean := upper(p_currency) IN ('OMR', 'BHD', 'KWD');
BEGIN
  IF p_rate IS NULL OR p_rate <= 0 THEN
    RAISE EXCEPTION 'INTL_FX_MISSING: No exchange rate configured for %', p_currency;
  END IF;
  IF p_inr IS NULL OR p_inr <= 0 THEN
    RETURN 0;
  END IF;

  v_eff := p_rate / (1 + greatest(coalesce(p_markup, 0), 0) / 100.0);
  v_foreign := p_inr / v_eff;

  IF v_three THEN
    RETURN CASE coalesce(p_rounding, 'x.99')
      WHEN 'x.99' THEN (ceil(v_foreign * 20) * 50)::bigint
      WHEN 'x.00' THEN (ceil(v_foreign) * 1000)::bigint
      ELSE (ceil(v_foreign * 100) * 10)::bigint
    END;
  END IF;

  RETURN CASE coalesce(p_rounding, 'x.99')
    WHEN 'x.99' THEN (ceil(v_foreign) * 100 - 1)::bigint
    WHEN 'x.00' THEN (ceil(v_foreign) * 100)::bigint
    ELSE ceil(v_foreign * 100)::bigint
  END;
END;
$$;


-- 7) place_order_with_items: international branch -----------------------------------------
-- Copied from 20261014000000_recovery_offer_stacking.sql. Lines added for international are
-- marked "INTL". Everything else is identical, so India (country_code 'IN') behaves as before.
CREATE OR REPLACE FUNCTION place_order_with_items(p_order jsonb, p_items jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id uuid;
  v_item jsonb;
  v_product_id uuid;
  v_variant_unit_id uuid;
  v_quantity integer;
  v_vendor_id uuid;
  v_barcode text;
  v_timeout_hours integer;
  v_deadline timestamptz;
  v_unit_price integer;
  v_computed_subtotal integer := 0;
  v_distinct_products integer := 0;
  v_shipping integer;
  v_gst integer;
  v_user_id uuid;
  v_payment_method text;

  -- ---- return/RTO risk gate ----
  v_phone text;
  v_risk_total integer;
  v_blocked_until timestamptz;

  -- ---- coupon ----
  v_coupon_code text;
  v_coupon record;
  v_coupon_discount integer := 0;
  -- ---- abandoned-cart recovery offer (stacked on top of the coupon above) ----
  v_recovery_code text;
  v_recovery record;
  v_recovery_discount integer := 0;
  v_recovery_base integer := 0;

  -- ---- BOGO (recomputed server-side) ----
  v_promo record;
  v_buy_qty integer;
  v_get_qty integer;
  v_group_size integer;
  v_discount_pct numeric;
  v_units integer[];
  v_unit_count integer;
  v_idx integer;
  v_j integer;
  v_bogo_raw numeric := 0;
  v_bogo_discount integer := 0;

  -- ---- gift card ----
  v_gift_card_code text;
  v_gift_card record;
  v_gift_card_id uuid;
  v_client_gift_card_discount integer;
  v_gift_card_discount integer := 0;

  -- ---- loyalty ----
  v_loyalty_settings jsonb;
  v_redeem_value numeric;
  v_min_redeem integer;
  v_client_points integer;
  v_user_balance integer;
  v_max_points_by_subtotal integer;
  v_points_redeemed integer := 0;
  v_loyalty_discount integer := 0;

  -- ---- online payment discount ----
  v_discount_setting jsonb;
  v_payment_discount_percent numeric;
  v_payment_discount integer := 0;

  -- ---- affiliate ----
  v_affiliate_code text;
  v_affiliate_id uuid;
  v_affiliate_commission_percent numeric;
  v_is_affiliate_order boolean := false;
  v_affiliate_commission_amount integer;

  -- ---- reseller ----
  v_is_reseller boolean := false;
  v_client_total integer := 0;
  v_reseller_base_cost integer;
  v_reseller_profit integer;
  v_reseller_margin_percent numeric;

  v_running_subtotal integer;
  v_total integer;
  v_items_snapshot jsonb := '[]'::jsonb;

  -- ---- INTL: international orders ----
  v_country text := 'IN';
  v_is_intl boolean := false;
  v_intl jsonb;
  v_country_row record;
  v_zone record;
  v_duty_mode text := 'DAP';
  v_duty_accepted boolean := false;
  v_postal text;
  v_weight_g integer := 0;
  v_default_weight integer;
  v_fx_base numeric;
  v_fx_markup numeric;
  v_price_markup numeric;
  v_fx_effective numeric;
  v_charge_minor bigint;
  v_ship_addr jsonb;
  v_addr_country text;
BEGIN
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Cannot place an order with no items';
  END IF;

  v_user_id := NULLIF(p_order->>'user_id', '')::uuid;
  v_payment_method := coalesce(p_order->>'payment_method', 'cod');
  v_ship_addr := p_order->'shipping_address';

  -- ---- INTL: decide the country and run every eligibility check up-front ----
  v_country := upper(coalesce(NULLIF(trim(p_order->>'country_code'), ''), 'IN'));
  v_is_intl := v_country <> 'IN';
  v_addr_country := lower(coalesce(NULLIF(trim(p_order->'shipping_address'->>'country'), ''), 'india'));

  IF NOT v_is_intl THEN
    -- An "India" order must really ship to India (stops anyone dodging international pricing).
    IF v_addr_country NOT IN ('india', 'in') THEN
      RAISE EXCEPTION 'INTL_COUNTRY_MISMATCH: Address country does not match the order country.';
    END IF;
  ELSE
    SELECT value INTO v_intl FROM settings WHERE key = 'international_settings';
    IF NOT coalesce((v_intl->>'international_enabled')::boolean, false) THEN
      RAISE EXCEPTION 'INTL_DISABLED: International orders are not available right now.';
    END IF;

    IF v_payment_method <> 'online' THEN
      RAISE EXCEPTION 'INTL_PREPAID_ONLY: International orders must be paid online by card.';
    END IF;

    SELECT * INTO v_country_row FROM intl_countries WHERE code = v_country AND is_enabled;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'INTL_COUNTRY_NOT_ENABLED: We do not ship to this country yet.';
    END IF;

    IF coalesce((p_order->>'is_reseller_order')::boolean, false) THEN
      RAISE EXCEPTION 'INTL_NOT_SUPPORTED: Reseller orders are not available for international shipping.';
    END IF;

    v_duty_mode := CASE WHEN upper(coalesce(v_intl->>'default_duty_mode', 'DAP')) = 'DDP' THEN 'DDP' ELSE 'DAP' END;
    v_duty_accepted := coalesce((p_order->>'duty_notice_accepted')::boolean, false);
    IF v_duty_mode = 'DAP' AND NOT v_duty_accepted THEN
      RAISE EXCEPTION 'INTL_DUTY_NOTICE_REQUIRED: Please accept the import duty and tax notice to continue.';
    END IF;

    SELECT * INTO v_zone
    FROM shipping_zones
    WHERE is_active AND v_country = ANY (countries)
    ORDER BY created_at
    LIMIT 1;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'INTL_NO_ZONE: Shipping is not configured for this country.';
    END IF;

    v_postal := upper(trim(coalesce(
      v_ship_addr->>'pincode', v_ship_addr->>'postal_code', v_ship_addr->>'zip', '')));
    IF v_country_row.postal_regex IS NOT NULL THEN
      IF v_postal = '' OR v_postal !~* v_country_row.postal_regex THEN
        RAISE EXCEPTION 'INTL_BAD_POSTAL: Please enter a valid postal code for %.', v_country_row.name;
      END IF;
    END IF;
    IF v_country_row.requires_state
       AND coalesce(trim(v_ship_addr->>'state'), '') = '' THEN
      RAISE EXCEPTION 'INTL_STATE_REQUIRED: Please enter your state / province.';
    END IF;

    -- Server-authoritative country on the saved address.
    v_ship_addr := coalesce(v_ship_addr, '{}'::jsonb)
      || jsonb_build_object('country', v_country_row.name, 'country_code', v_country);
  END IF;

  SELECT coalesce((value->>'accept_timeout_hours')::integer, 12)
  INTO v_timeout_hours
  FROM settings WHERE key = 'vendor_order_settings';
  v_timeout_hours := coalesce(v_timeout_hours, 12);

  -- ---- Return/RTO risk gate: COD only, 15-day cooldown ----
  v_phone := NULLIF(trim(p_order->>'customer_phone'), '');
  IF v_phone IS NOT NULL AND v_payment_method = 'cod' THEN
    SELECT (return_count + rto_count), blocked_until
    INTO v_risk_total, v_blocked_until
    FROM customer_return_risk
    WHERE phone = v_phone;

    IF v_blocked_until IS NOT NULL AND now() < v_blocked_until THEN
      RAISE EXCEPTION 'COD_BLOCKED_RETURN_RISK: This phone number has % past return/RTO order(s). COD is paused until %. Please choose online payment to place this order.',
        coalesce(v_risk_total, 0), to_char(v_blocked_until, 'DD Mon YYYY');
    END IF;
  END IF;

  -- ---- Pass 1: recompute authoritative prices, never trust the client ----
  SELECT count(DISTINCT (item->>'product_id')) INTO v_distinct_products
  FROM jsonb_array_elements(p_items) AS item;

  v_default_weight := greatest(coalesce((v_intl->>'default_item_weight_grams')::integer, 700), 1);

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::uuid;
    v_quantity := (v_item->>'quantity')::integer;

    IF v_product_id IS NULL OR v_quantity IS NULL OR v_quantity <= 0 THEN
      RAISE EXCEPTION 'Invalid order item: missing product_id or quantity';
    END IF;

    SELECT price INTO v_unit_price FROM products WHERE id = v_product_id;
    IF v_unit_price IS NULL THEN
      RAISE EXCEPTION 'Product % not found (or has no price)', v_product_id;
    END IF;

    v_computed_subtotal := v_computed_subtotal + (v_unit_price * v_quantity);
    v_items_snapshot := v_items_snapshot || jsonb_build_array(v_item || jsonb_build_object('price', v_unit_price));

    -- INTL: parcel weight for the zone's "extra per 500 g" charge.
    IF v_is_intl THEN
      v_weight_g := v_weight_g + v_quantity * coalesce(
        (SELECT weight_grams FROM products WHERE id = v_product_id), v_default_weight);
    END IF;
  END LOOP;

  -- INTL: shipping is computed below from the zone; the client's value is ignored.
  IF v_is_intl THEN
    v_shipping := 0;
    v_gst := 0; -- export under LUT: no GST charged
  ELSE
    v_shipping := greatest(coalesce((p_order->>'shipping_charge')::integer, 0), 0);
    -- Stored on the row for the invoice only. NOT added to the total: every
    -- price in this store is already GST-inclusive (see header note 1).
    v_gst := greatest(coalesce((p_order->>'gst_amount')::integer, 0), 0);
  END IF;
  v_running_subtotal := v_computed_subtotal;

  -- ---- Coupon: look the code up ourselves, never trust the discount amount ----
  v_coupon_code := NULLIF(p_order->>'coupon_code', '');
  IF v_coupon_code IS NOT NULL THEN
    SELECT * INTO v_coupon FROM coupons WHERE lower(code) = lower(v_coupon_code);

    IF FOUND
      AND v_coupon.is_active
      AND (v_coupon.expires_at IS NULL OR v_coupon.expires_at > now())
      AND (v_coupon.usage_limit IS NULL OR v_coupon.times_used < v_coupon.usage_limit)
      AND v_running_subtotal >= v_coupon.min_order_value
    THEN
      -- Same formula as computeCouponDiscount() in lib/coupons-api.ts.
      v_coupon_discount := CASE
        WHEN v_coupon.discount_type = 'percentage'
          THEN round(v_running_subtotal * v_coupon.discount_value / 100)
        ELSE round(v_coupon.discount_value) * greatest(1, v_distinct_products)
      END;
      v_coupon_discount := least(greatest(v_coupon_discount, 0), v_running_subtotal);

      UPDATE coupons SET times_used = times_used + 1 WHERE id = v_coupon.id;
    ELSE
      v_coupon_code := NULL;
      v_coupon_discount := 0;
    END IF;
  END IF;

  -- ---- Recovery offer: an EXTRA coupon from an abandoned-cart email / WhatsApp link ----
  -- Stacks on top of the normal coupon. Looked up and priced here, never trusted from the
  -- client. Priced on what is left after the first coupon (same order as the storefront).
  -- Folded into coupon_code ("A + B") / coupon_discount so invoices, emails and every
  -- total below keep working unchanged.
  v_recovery_code := NULLIF(p_order->>'recovery_coupon_code', '');
  IF v_recovery_code IS NOT NULL THEN
    SELECT * INTO v_recovery FROM coupons WHERE lower(code) = lower(v_recovery_code);

    IF FOUND
      AND v_recovery.is_active
      AND (v_recovery.expires_at IS NULL OR v_recovery.expires_at > now())
      AND (v_recovery.usage_limit IS NULL OR v_recovery.times_used < v_recovery.usage_limit)
      AND v_running_subtotal >= v_recovery.min_order_value
      AND (v_coupon_code IS NULL OR lower(v_coupon_code) <> lower(v_recovery.code))
    THEN
      v_recovery_base := greatest(v_running_subtotal - v_coupon_discount, 0);
      v_recovery_discount := CASE
        WHEN v_recovery.discount_type = 'percentage'
          THEN round(v_recovery_base * v_recovery.discount_value / 100)
        ELSE round(v_recovery.discount_value) * greatest(1, v_distinct_products)
      END;
      v_recovery_discount := least(greatest(v_recovery_discount, 0), v_recovery_base);

      UPDATE coupons SET times_used = times_used + 1 WHERE id = v_recovery.id;

      v_coupon_code := CASE
        WHEN v_coupon_code IS NULL THEN v_recovery.code
        ELSE v_coupon_code || ' + ' || v_recovery.code
      END;
      v_coupon_discount := v_coupon_discount + v_recovery_discount;
    END IF;
  END IF;
  v_running_subtotal := greatest(v_running_subtotal - v_coupon_discount, 0);

  -- ---- BOGO: recomputed here, mirroring computeBogoDiscount() ----
  -- A coupon and a BOGO promo can both be live at once; the client
  -- subtracts them independently from the subtotal, so we do the same.
  FOR v_promo IN
    SELECT id, buy_qty, get_qty, free_item_discount_percent, scope, collection_id
    FROM promotions
    WHERE is_active
      AND offer_type = 'buy_x_get_y'
      AND (starts_at IS NULL OR starts_at <= now())
      AND (ends_at IS NULL OR ends_at >= now())
  LOOP
    v_buy_qty := greatest(coalesce(v_promo.buy_qty, 1), 1);
    v_get_qty := greatest(coalesce(v_promo.get_qty, 1), 1);
    v_group_size := v_buy_qty + v_get_qty;
    v_discount_pct := least(100, greatest(0, coalesce(v_promo.free_item_discount_percent, 100)));

    -- Every qualifying UNIT (a line of quantity 3 contributes 3 entries),
    -- priced from `products`, cheapest first.
    SELECT coalesce(array_agg(u.price ORDER BY u.price), ARRAY[]::integer[])
    INTO v_units
    FROM (
      SELECT pr.price AS price
      FROM jsonb_array_elements(p_items) AS it
      JOIN products pr ON pr.id = (it->>'product_id')::uuid
      CROSS JOIN generate_series(1, greatest((it->>'quantity')::integer, 0)) AS g
      WHERE v_promo.scope = 'all'
         OR (
           v_promo.scope = 'collection'
           AND v_promo.collection_id IS NOT NULL
           AND EXISTS (
             SELECT 1 FROM collection_products cp
             WHERE cp.collection_id = v_promo.collection_id
               AND cp.product_id = pr.id
           )
         )
    ) u;

    v_unit_count := coalesce(array_length(v_units, 1), 0);
    v_idx := 1;
    -- Only a FULL group of (buy_qty + get_qty) units qualifies; a partial
    -- trailing group earns nothing.
    WHILE v_idx + v_group_size - 1 <= v_unit_count LOOP
      FOR v_j IN v_idx .. (v_idx + v_get_qty - 1) LOOP
        v_bogo_raw := v_bogo_raw + (v_units[v_j] * v_discount_pct / 100.0);
      END LOOP;
      v_idx := v_idx + v_group_size;
    END LOOP;
  END LOOP;

  -- Rounded once, after summing across every promotion -- same as the
  -- single Math.round() at the end of computeBogoDiscount().
  v_bogo_discount := least(greatest(round(v_bogo_raw)::integer, 0), v_running_subtotal);
  v_running_subtotal := greatest(v_running_subtotal - v_bogo_discount, 0);

  -- ---- Gift card: validate against the real balance, never the client's number ----
  v_gift_card_code := NULLIF(p_order->>'gift_card_code', '');
  v_client_gift_card_discount := greatest(coalesce((p_order->>'gift_card_discount')::integer, 0), 0);
  IF v_gift_card_code IS NOT NULL AND v_client_gift_card_discount > 0 THEN
    SELECT * INTO v_gift_card FROM gift_cards WHERE lower(code) = lower(v_gift_card_code);

    IF FOUND
      AND v_gift_card.status = 'active'
      AND (v_gift_card.expires_at IS NULL OR v_gift_card.expires_at > now())
      AND v_gift_card.balance > 0
    THEN
      v_gift_card_discount := least(v_client_gift_card_discount, v_gift_card.balance, v_running_subtotal);
      v_gift_card_id := v_gift_card.id;
    ELSE
      v_gift_card_code := NULL;
      v_gift_card_discount := 0;
    END IF;
  ELSE
    v_gift_card_code := NULL;
    v_gift_card_discount := 0;
  END IF;
  v_running_subtotal := greatest(v_running_subtotal - v_gift_card_discount, 0);

  -- ---- Loyalty points: only from THIS user's real balance/settings ----
  v_client_points := greatest(coalesce((p_order->>'loyalty_points_redeemed')::integer, 0), 0);
  IF v_user_id IS NOT NULL AND v_client_points > 0 THEN
    SELECT value INTO v_loyalty_settings FROM settings WHERE key = 'loyalty_program';
    IF coalesce((v_loyalty_settings->>'enabled')::boolean, true) THEN
      v_redeem_value := coalesce((v_loyalty_settings->>'redeem_value_per_point')::numeric, 0.5);
      v_min_redeem := coalesce((v_loyalty_settings->>'min_redeem_points')::integer, 100);

      SELECT coalesce(loyalty_balance, 0) INTO v_user_balance FROM profiles WHERE id = v_user_id;
      v_user_balance := coalesce(v_user_balance, 0);

      v_max_points_by_subtotal := CASE
        WHEN v_redeem_value > 0 THEN floor(v_running_subtotal / v_redeem_value)::integer
        ELSE 0
      END;

      v_points_redeemed := least(v_client_points, v_user_balance, v_max_points_by_subtotal);
      IF v_points_redeemed < v_min_redeem THEN
        v_points_redeemed := 0;
      END IF;
      v_loyalty_discount := round(v_points_redeemed * v_redeem_value);

      IF v_points_redeemed > 0 THEN
        INSERT INTO loyalty_points_ledger (user_id, points, type, reason)
        VALUES (v_user_id, -v_points_redeemed, 'redeem', 'Redeemed at checkout');
      END IF;
    END IF;
  END IF;
  v_running_subtotal := greatest(v_running_subtotal - v_loyalty_discount, 0);

  -- ---- INTL: server-side shipping from the zone (client value ignored) ----
  IF v_is_intl THEN
    IF v_running_subtotal < v_zone.min_order_inr THEN
      RAISE EXCEPTION 'INTL_BELOW_MIN_ORDER: Minimum order value for % is Rs. %.', v_country_row.name, v_zone.min_order_inr;
    END IF;

    IF v_zone.free_shipping_threshold_inr > 0 AND v_running_subtotal >= v_zone.free_shipping_threshold_inr THEN
      v_shipping := 0;
    ELSE
      -- base covers the first 500 g; each further started 500 g adds per_extra_500g_inr.
      v_shipping := v_zone.base_rate_inr
        + v_zone.per_extra_500g_inr * ceil(greatest(v_weight_g - 500, 0) / 500.0)::integer;
    END IF;
  END IF;

  -- ---- Online payment discount: recompute from Settings, only for 'online' ----
  -- INTL: the India-only online discount never applies to international orders.
  IF v_payment_method = 'online' AND NOT v_is_intl THEN
    SELECT value INTO v_discount_setting FROM settings WHERE key = 'payment_discount';
    v_payment_discount_percent := CASE
      WHEN coalesce((v_discount_setting->>'enabled')::boolean, false)
        THEN greatest(coalesce((v_discount_setting->>'percent')::numeric, 0), 0)
      ELSE 0
    END;
    v_payment_discount := round(v_running_subtotal * v_payment_discount_percent / 100);
  ELSE
    v_payment_discount := 0;
  END IF;

  -- NOTE: v_gst is deliberately NOT part of this sum -- prices are
  -- GST-inclusive, so adding it would charge the tax twice (header note 1).
  v_total := greatest(
    v_computed_subtotal + v_shipping
      - v_coupon_discount - v_bogo_discount - v_gift_card_discount
      - v_loyalty_discount - v_payment_discount,
    0
  );

  -- ---- INTL: convert the INR total into the customer's charge currency ----
  IF v_is_intl THEN
    v_fx_base := (v_intl->'fx_rates'->>v_country_row.currency)::numeric;
    v_fx_markup := coalesce((v_intl->>'fx_markup_percent')::numeric, 0);
    v_price_markup := greatest(coalesce((v_intl->>'intl_price_markup_percent')::numeric, 0), 0);
    IF v_fx_base IS NULL OR v_fx_base <= 0 THEN
      RAISE EXCEPTION 'INTL_FX_MISSING: No exchange rate configured for %', v_country_row.currency;
    END IF;

    v_fx_effective := round(v_fx_base / (1 + greatest(v_fx_markup, 0) / 100.0), 6);
    v_charge_minor := intl_inr_to_minor(
      v_total * (1 + v_price_markup / 100.0),
      v_country_row.currency, v_fx_base, v_fx_markup,
      coalesce(v_intl->>'price_rounding', 'x.99'));
    IF v_charge_minor <= 0 THEN
      RAISE EXCEPTION 'INTL_ZERO_TOTAL: International orders must have a payable amount.';
    END IF;
  END IF;

  -- ---- Reseller: book the order at the reseller's own selling price ----
  v_is_reseller := coalesce((p_order->>'is_reseller_order')::boolean, false);
  v_client_total := greatest(coalesce(round((p_order->>'total_amount')::numeric)::integer, 0), 0);
  IF v_is_reseller AND v_client_total > v_total THEN
    -- Only ever adjusts UPWARDS from the recomputed cost, so this can't be
    -- used to pay less than the goods actually cost.
    v_reseller_base_cost := v_total;
    v_reseller_profit := v_client_total - v_total;
    v_reseller_margin_percent := CASE
      WHEN v_total > 0 THEN round((v_reseller_profit::numeric / v_total) * 100, 1)
      ELSE NULL
    END;
    v_total := v_client_total;
  ELSIF v_is_reseller THEN
    v_reseller_base_cost := v_total;
    v_reseller_profit := 0;
    v_reseller_margin_percent := 0;
  END IF;

  -- ---- Affiliate lookup: server-side only, never trust a client commission ----
  v_affiliate_code := NULLIF(trim(p_order->>'affiliate_code'), '');
  IF v_affiliate_code IS NOT NULL THEN
    SELECT id, commission_percent
    INTO v_affiliate_id, v_affiliate_commission_percent
    FROM affiliates
    WHERE code = v_affiliate_code AND status = 'approved';

    IF v_affiliate_id IS NOT NULL THEN
      v_is_affiliate_order := true;
      v_affiliate_commission_amount := round(v_computed_subtotal * v_affiliate_commission_percent / 100.0);
    ELSE
      -- Unknown/unapproved code: silently ignore rather than failing
      -- the whole order placement over a stale/expired referral link.
      v_affiliate_code := NULL;
    END IF;
  END IF;

  INSERT INTO orders (
    user_id, items, total_amount, status, payment_method, shipping_address,
    customer_name, customer_email, customer_phone, session_id, subtotal,
    shipping_charge, gst_amount, coupon_code, coupon_discount, bogo_discount,
    gift_card_code, gift_card_discount, loyalty_points_redeemed,
    loyalty_discount, online_payment_discount, is_reseller_order, reseller_id,
    reseller_margin_percent, reseller_base_cost, reseller_profit,
    reseller_brand_name, is_affiliate_order, affiliate_id, affiliate_code,
    affiliate_commission_percent, affiliate_commission_amount,
    -- INTL (for India these equal the column defaults)
    country_code, is_international, charge_currency, charge_amount_minor,
    fx_rate_used, intl_shipping_inr, duty_mode, duty_notice_accepted
  )
  VALUES (
    v_user_id,
    v_items_snapshot,
    v_total,
    coalesce(p_order->>'status', 'pending'),
    v_payment_method,
    v_ship_addr,
    p_order->>'customer_name',
    p_order->>'customer_email',
    p_order->>'customer_phone',
    p_order->>'session_id',
    v_computed_subtotal,
    v_shipping,
    v_gst,
    v_coupon_code,
    v_coupon_discount,
    v_bogo_discount,
    v_gift_card_code,
    v_gift_card_discount,
    v_points_redeemed,
    v_loyalty_discount,
    v_payment_discount,
    v_is_reseller,
    NULLIF(p_order->>'reseller_id', '')::uuid,
    v_reseller_margin_percent,
    v_reseller_base_cost,
    v_reseller_profit,
    NULLIF(p_order->>'reseller_brand_name', ''),
    v_is_affiliate_order,
    v_affiliate_id,
    v_affiliate_code,
    v_affiliate_commission_percent,
    v_affiliate_commission_amount,
    v_country,
    v_is_intl,
    CASE WHEN v_is_intl THEN v_country_row.currency ELSE 'INR' END,
    CASE WHEN v_is_intl THEN v_charge_minor ELSE NULL END,
    CASE WHEN v_is_intl THEN v_fx_effective ELSE NULL END,
    CASE WHEN v_is_intl THEN v_shipping ELSE 0 END,
    v_duty_mode,
    v_duty_accepted
  )
  RETURNING id INTO v_order_id;

  IF v_points_redeemed > 0 THEN
    UPDATE loyalty_points_ledger
    SET order_id = v_order_id
    WHERE user_id = v_user_id AND order_id IS NULL AND type = 'redeem' AND points = -v_points_redeemed
    AND id = (
      SELECT id FROM loyalty_points_ledger
      WHERE user_id = v_user_id AND order_id IS NULL AND type = 'redeem' AND points = -v_points_redeemed
      ORDER BY created_at DESC LIMIT 1
    );
  END IF;

  -- Uses v_gift_card_id (plain uuid, always safe to read) instead of
  -- v_gift_card.id -- see 20260930040000.
  IF v_gift_card_discount > 0 AND v_gift_card_id IS NOT NULL THEN
    UPDATE gift_cards SET balance = balance - v_gift_card_discount WHERE id = v_gift_card_id;
  END IF;

  -- ---- Pass 2: stock decrement + order_items, using the same authoritative price ----
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::uuid;
    v_quantity := (v_item->>'quantity')::integer;
    v_variant_unit_id := NULLIF(v_item->>'variant_unit_id', '')::uuid;

    SELECT vendor_id, barcode, price INTO v_vendor_id, v_barcode, v_unit_price
    FROM products WHERE id = v_product_id;

    IF v_variant_unit_id IS NOT NULL THEN
      PERFORM decrement_variant_unit_stock(v_variant_unit_id, v_quantity);
    ELSIF v_vendor_id IS NOT NULL THEN
      PERFORM decrement_product_vendor_stock(v_product_id, v_quantity);
    END IF;

    v_deadline := CASE WHEN v_vendor_id IS NOT NULL
                        THEN now() + (v_timeout_hours || ' hours')::interval
                        ELSE NULL END;

    INSERT INTO order_items (
      order_id, product_id, product_name, size, quantity, price,
      vendor_id, variant_unit_id, barcode, stage, vendor_accept_deadline
    ) VALUES (
      v_order_id,
      v_product_id,
      v_item->>'product_name',
      v_item->>'size',
      v_quantity,
      v_unit_price,
      v_vendor_id,
      v_variant_unit_id,
      v_barcode,
      'placed',
      v_deadline
    );
  END LOOP;

  RETURN v_order_id;
END;
$$;

GRANT EXECUTE ON FUNCTION place_order_with_items(jsonb, jsonb) TO anon, authenticated;
