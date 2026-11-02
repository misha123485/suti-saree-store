-- RUN THIS ONLY WHEN YOU ARE READY FOR REAL CUSTOMERS (not a migration, do not put it in supabase/migrations).
-- Checklist first:
--   1. Netlify env: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET (test keys first), then redeploy.
--   2. Stripe webhook endpoint https://sutisaree.com/api/stripe/webhook is created (events in docs/INTERNATIONAL.md).
--   3. Admin > Settings > Export details filled (IEC, GSTIN, LUT, AD code) and rates replaced by real courier quotes.
-- Turns the master switch ON only if at least one country is enabled AND covered by an active zone.
UPDATE settings
SET value = jsonb_set(coalesce(value, '{}'::jsonb), '{international_enabled}', 'true'::jsonb)
WHERE key = 'international_settings'
  AND EXISTS (
    SELECT 1 FROM intl_countries c
    JOIN shipping_zones z ON z.is_active AND c.code = ANY (z.countries)
    WHERE c.is_enabled
  );

-- TO SWITCH OFF AGAIN (India checkout back to exactly as before):
-- UPDATE settings SET value = jsonb_set(value, '{international_enabled}', 'false'::jsonb) WHERE key = 'international_settings';
