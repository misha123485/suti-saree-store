-- Telegram new-order alerts.
-- Safe to run more than once.

-- 1) Once-per-order guard for the alert.
alter table orders add column if not exists telegram_notified_at timestamptz;

-- 2) Private key/value store for secrets (Telegram bot token, chat id).
--    RLS is ON and there are deliberately NO policies, so the public anon key and
--    logged-in customers can neither read nor write it. Only the server (service role)
--    can, through /api/admin/settings/telegram.
create table if not exists admin_private_settings (
  key        text primary key,
  value      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table admin_private_settings enable row level security;
revoke all on admin_private_settings from anon, authenticated;
grant all on admin_private_settings to service_role;
