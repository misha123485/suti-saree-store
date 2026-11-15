-- Free-tier (500 MB) bachane ke liye automatic cleanup of activity_events.
-- Replaces prune_activity_events() from 20261115000000 with tiered retention:
--   page_view                          45 din   (sabse zyada rows, dashboard use nahi karta)
--   product_view                       120 din  (Shopper Insights max 90 din dekhta hai)
--   search / wishlist / variant_switch 180 din
--   add_to_cart / checkout_start / purchase  400 din (asli business data, zyada time rakho)
--
-- Run: Supabase Dashboard > SQL Editor.
-- Agar pg_cron enable nahi hai to Database > Extensions me "pg_cron" ON karke ye
-- file dobara run karo. Tab tak manually chala sakte ho:  SELECT prune_activity_events();

CREATE OR REPLACE FUNCTION prune_activity_events(
  page_view_days integer DEFAULT 45,
  product_view_days integer DEFAULT 120,
  other_days integer DEFAULT 180,
  core_days integer DEFAULT 400
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n integer := 0;
  k integer;
BEGIN
  DELETE FROM activity_events WHERE event_type = 'page_view'
    AND created_at < now() - make_interval(days => page_view_days);
  GET DIAGNOSTICS k = ROW_COUNT; n := n + k;

  DELETE FROM activity_events WHERE event_type = 'product_view'
    AND created_at < now() - make_interval(days => product_view_days);
  GET DIAGNOSTICS k = ROW_COUNT; n := n + k;

  DELETE FROM activity_events WHERE event_type IN ('search', 'wishlist', 'variant_switch')
    AND created_at < now() - make_interval(days => other_days);
  GET DIAGNOSTICS k = ROW_COUNT; n := n + k;

  DELETE FROM activity_events WHERE event_type IN ('add_to_cart', 'checkout_start', 'purchase')
    AND created_at < now() - make_interval(days => core_days);
  GET DIAGNOSTICS k = ROW_COUNT; n := n + k;

  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION prune_activity_events(integer, integer, integer, integer) FROM PUBLIC, anon, authenticated;

-- Remove the older 1-argument version if it exists (avoids two overloads).
DROP FUNCTION IF EXISTS prune_activity_events(integer);

-- Schedule: every night 03:00 UTC (08:30 IST). Never fails the migration.
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;
  PERFORM cron.unschedule('prune-activity-events')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'prune-activity-events');
  PERFORM cron.schedule('prune-activity-events', '0 3 * * *', 'SELECT public.prune_activity_events()');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron schedule skipped (%): enable pg_cron in Database > Extensions and re-run this file.', SQLERRM;
END $$;
