-- Phase 1 verification (run in Supabase SQL editor AFTER the migration).
-- Nothing here creates real orders except Q6, which is rolled back.

-- Q1. New order columns exist and old rows are untouched (expect all 'IN' / false / 'INR')
SELECT country_code, is_international, charge_currency, count(*)
FROM orders GROUP BY 1,2,3;

-- Q2. Seed data: 11 countries, all disabled; 4 inactive placeholder zones
SELECT code, currency, is_enabled FROM intl_countries ORDER BY sort;
SELECT name, countries, is_active, base_rate_inr FROM shipping_zones;

-- Q3. Settings rows + lock policies (expect 4 policies named intl_settings_*)
SELECT key FROM settings WHERE key IN ('international_settings','international_costs','export_details');
SELECT policyname, permissive, cmd FROM pg_policies
WHERE tablename = 'settings' AND policyname LIKE 'intl_settings_%';

-- Q4. Anon cannot see/write secret keys (expect 0 rows, then an RLS error on the write)
BEGIN;
SET LOCAL ROLE anon;
SELECT key FROM settings WHERE key IN ('export_details','international_costs');   -- 0 rows
SELECT key FROM settings WHERE key = 'international_settings';                    -- 1 row (public)
UPDATE settings SET value = '{"international_enabled": true}'::jsonb
 WHERE key = 'international_settings';                                            -- 0 rows updated
ROLLBACK;

-- Q5. Currency formula. INR 5000 @ USD 90, 2% markup, x.99  => 5699 (= $56.99)
--     OMR (3 decimals) INR 5000 @ 235 => multiple of 50 (Stripe needs divisible by 10)
SELECT intl_inr_to_minor(5000, 'USD', 90, 2, 'x.99')  AS usd_minor_expect_5699,
       intl_inr_to_minor(5000, 'OMR', 235, 2, 'x.99') AS omr_minor,
       intl_inr_to_minor(5000, 'AED', 24.5, 2, 'x.00') AS aed_minor_whole_unit;

-- Q6. India order is unchanged: place a test order, compare to expected, ROLL BACK.
--     Replace <PRODUCT_UUID> with any product id. total must = price*qty + shipping (no change).
BEGIN;
SELECT place_order_with_items(
  '{"payment_method":"cod","shipping_charge":99,"customer_name":"T","customer_email":"t@t.com",
    "customer_phone":"9999999999","shipping_address":{"address":"x","city":"Kolkata","state":"WB","pincode":"700001","country":"India"}}'::jsonb,
  '[{"product_id":"<PRODUCT_UUID>","quantity":1,"product_name":"t"}]'::jsonb
) AS order_id;
SELECT total_amount, subtotal, shipping_charge, country_code, is_international, charge_currency
FROM orders ORDER BY created_at DESC LIMIT 1;
ROLLBACK;

-- Q7. International orders are refused while the flag is OFF (expect INTL_DISABLED error)
BEGIN;
SELECT place_order_with_items(
  '{"country_code":"US","payment_method":"online","duty_notice_accepted":true,"customer_name":"T",
    "customer_email":"t@t.com","customer_phone":"+12025550100",
    "shipping_address":{"address":"x","city":"NYC","state":"NY","pincode":"10001","country":"United States"}}'::jsonb,
  '[{"product_id":"<PRODUCT_UUID>","quantity":1,"product_name":"t"}]'::jsonb
);
ROLLBACK;
