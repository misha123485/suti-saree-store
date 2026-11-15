-- Shopper Insights (Admin > Analytics > Shopper Insights)
--
-- Adds a few OPTIONAL columns to activity_events so the new dashboard can show
--   * kaun sa visitor kitni baar wapas aaya   -> visitor_id (browser-level, localStorage)
--   * kahan se aaya (country / state / city)   -> country, region, city (from Vercel edge headers)
--   * mobile ya desktop                        -> device
--   * kahan se aaya (instagram, google, ...)   -> source
--
-- Sab columns nullable hain, purane rows ko koi problem nahi.
-- IMPORTANT: Is migration ko Supabase SQL Editor me run karo PEHLE, phir code deploy karo.

ALTER TABLE activity_events ADD COLUMN IF NOT EXISTS visitor_id text;
ALTER TABLE activity_events ADD COLUMN IF NOT EXISTS country    text;
ALTER TABLE activity_events ADD COLUMN IF NOT EXISTS region     text;
ALTER TABLE activity_events ADD COLUMN IF NOT EXISTS city       text;
ALTER TABLE activity_events ADD COLUMN IF NOT EXISTS device     text;
ALTER TABLE activity_events ADD COLUMN IF NOT EXISTS source     text;

-- Dashboard hamesha "event_type + date range" se query karta hai.
CREATE INDEX IF NOT EXISTS idx_activity_events_type_created
  ON activity_events(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_events_visitor_id
  ON activity_events(visitor_id) WHERE visitor_id IS NOT NULL;

-- ------------------------------------------------------------------
-- Free-tier (500 MB) bachane ke liye: page_view rows sabse zyada hote hain
-- aur dashboard unhe use nahi karta. Ye function purane page_view rows delete
-- karta hai. Cart / checkout / purchase rows ko haath nahi lagata.
--
-- Manual chalane ke liye:   SELECT prune_activity_events(60);
-- Auto (Supabase pg_cron on ho to, har raat 3 baje):
--   SELECT cron.schedule('prune-activity-events', '0 3 * * *',
--                        $$ SELECT prune_activity_events(60) $$);
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION prune_activity_events(keep_days integer DEFAULT 60)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted integer;
BEGIN
  DELETE FROM activity_events
  WHERE event_type = 'page_view'
    AND created_at < now() - make_interval(days => keep_days);
  GET DIAGNOSTICS deleted = ROW_COUNT;
  RETURN deleted;
END;
$$;

REVOKE ALL ON FUNCTION prune_activity_events(integer) FROM PUBLIC, anon, authenticated;
