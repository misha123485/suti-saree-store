-- Tracking ON/OFF switches (Admin > Analytics > settings button)
--
-- Admin yahan se chun sakta hai ki kaun sa event type jama hona band ho
-- (abhi: variant_switch). Isse activity_events table kam bharta hai (free 500MB bachta hai).
--
-- Table me sirf admin API (service role) likhti/padhti hai. RLS ON hai aur koi
-- public policy nahi, isliye browser se seedha access nahi hota.
-- Run karna zaroori: SQL Editor me ek baar. Na run karo to bhi site chalegi
-- (tracking pehle jaisi ON rahegi), bas toggle save nahi hoga.

CREATE TABLE IF NOT EXISTS tracking_settings (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE tracking_settings ENABLE ROW LEVEL SECURITY;

INSERT INTO tracking_settings (key, value)
VALUES ('disabled_event_types', '[]'::jsonb)
ON CONFLICT (key) DO NOTHING;
