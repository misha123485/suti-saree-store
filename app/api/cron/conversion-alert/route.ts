import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { getTelegramConfig, sendTelegramMessage } from '@/lib/telegram-notify';

export const dynamic = 'force-dynamic';

// Telegram alert: "log checkout tak aa rahe hain par order nahi ho raha".
// Usually means payment gateway / COD / checkout page me koi problem hai.
//
// Schedule: .github/workflows/conversion-alert.yml (GitHub Actions, free) hits
// this URL every hour. Vercel Hobby cron is once/day only, so we don't use it.
//
// Rules (all tunable below):
//  - look at the last WINDOW_HOURS hours
//  - alert if >= MIN_CHECKOUTS people started checkout and orders < MIN_ORDERS_OK
//  - never alert between 00:00 and 07:00 IST (kam traffic = fake alarm)
//  - same alert is not repeated for COOLDOWN_HOURS (state stored in admin_private_settings)
const WINDOW_HOURS = 3;
const MIN_CHECKOUTS = 5;
const MIN_ORDERS_OK = 1;
const COOLDOWN_HOURS = 6;
const STATE_KEY = 'conversion_alert_state';

export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const istHour = new Date(Date.now() + 5.5 * 3600_000).getUTCHours();
  if (istHour < 7) return NextResponse.json({ skipped: 'quiet hours' });

  try {
    const sb = getSupabaseAdmin();
    const since = new Date(Date.now() - WINDOW_HOURS * 3600_000).toISOString();

    const { data: co } = await sb.from('activity_events')
      .select('session_id').eq('event_type', 'checkout_start').gte('created_at', since).limit(2000);
    const checkoutSessions = new Set((co ?? []).map((r: any) => r.session_id)).size;

    const { count: orders } = await sb.from('orders')
      .select('id', { count: 'exact', head: true }).gte('created_at', since);

    if (checkoutSessions < MIN_CHECKOUTS || (orders ?? 0) >= MIN_ORDERS_OK) {
      return NextResponse.json({ ok: true, alert: false, checkoutSessions, orders });
    }

    const { data: st } = await sb.from('admin_private_settings').select('value').eq('key', STATE_KEY).maybeSingle();
    const last = st?.value?.lastSentAt ? new Date(st.value.lastSentAt).getTime() : 0;
    if (Date.now() - last < COOLDOWN_HOURS * 3600_000) {
      return NextResponse.json({ ok: true, alert: false, reason: 'cooldown' });
    }

    const tg = await getTelegramConfig();
    if (!tg.enabled || !tg.bot_token || !tg.chat_id) {
      return NextResponse.json({ ok: false, error: 'Telegram not configured' });
    }
    const text =
      `⚠️ Conversion alert\n` +
      `Pichle ${WINDOW_HOURS} ghante me ${checkoutSessions} log checkout tak aaye par ${orders ?? 0} order hua.\n` +
      `Payment gateway (Razorpay/Cashfree), COD aur checkout page ek baar khud test karke dekho.`;
    const sent = await sendTelegramMessage(tg.bot_token, tg.chat_id, text);
    if (sent.ok) {
      await sb.from('admin_private_settings').upsert(
        { key: STATE_KEY, value: { lastSentAt: new Date().toISOString() }, updated_at: new Date().toISOString() },
        { onConflict: 'key' }
      );
    }
    return NextResponse.json({ ok: sent.ok, alert: true, checkoutSessions, orders, error: sent.error });
  } catch (err: any) {
    console.error('[cron/conversion-alert] failed:', err);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
