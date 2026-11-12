TELEGRAM ORDER ALERTS - kaise lagayein
======================================

1) Is zip ko extract karke andar ke folders (lib, app, components, supabase) ko
   apne suti-saree-store folder me copy karo. "Replace" daba do jab pooche.
   (Ya patch: git apply telegram-alerts.patch)

   Files:
     lib/telegram-notify.ts                              (NEW)
     lib/order-confirmation.ts                           (UPDATED)
     app/api/admin/settings/telegram/route.ts            (NEW)
     components/admin/telegram-notify-card.tsx           (NEW)
     components/admin/settings-panel.tsx                 (UPDATED, 2 lines)
     supabase/migrations/20261113000000_orders_telegram_notified.sql  (NEW)

2) SUPABASE: SQL editor me migration file ka poora SQL chalao (pehle ye, deploy se pehle).
   Do cheezein banati hai: orders.telegram_notified_at column aur private
   admin_private_settings table (anon key se band).

3) git add . && git commit -m "Telegram order alerts" && git push

4) Deploy hone ke baad: Admin -> Settings -> "Telegram Order Alerts"
     - Bot token paste karo (naya wala, BotFather se)
     - Telegram me apne bot ko Start karke "hi" bhejo
     - "Detect Chat ID" dabao, phir Save
     - "Send test message" dabao -> iPhone pe message aana chahiye

Netlify env vars (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID) ab optional hain; agar admin
me kuch save nahi hai to wahi use hote hain.

Token kabhi code ya GitHub me mat daalna.
