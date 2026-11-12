import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAdminToken, ADMIN_SESSION_COOKIE } from '@/lib/admin-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import {
  TELEGRAM_SETTINGS_KEY,
  TELEGRAM_TOKEN_RE,
  TELEGRAM_CHAT_ID_RE,
  detectTelegramChatId,
  getTelegramConfig,
  maskToken,
  readStoredTelegramSettings,
  sendTelegramMessage,
  type StoredTelegramSettings,
} from '@/lib/telegram-notify';

// Telegram bot token + chat id for the new-order phone alert.
// The token is a secret: it lives in the RLS-locked `admin_private_settings` table and
// this route NEVER returns it in full -- GET only gives a masked preview.

export const dynamic = 'force-dynamic';

async function requireAdmin() {
  const cookie = cookies().get(ADMIN_SESSION_COOKIE)?.value ?? null;
  const verified = await verifyAdminToken(cookie);
  return verified.valid;
}

export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const cfg = await getTelegramConfig();
  return NextResponse.json({
    enabled: cfg.enabled,
    chat_id: cfg.chat_id,
    token_set: !!cfg.bot_token,
    token_masked: maskToken(cfg.bot_token),
    token_source: cfg.token_source,
    chat_source: cfg.chat_source,
  });
}

export async function PUT(req: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as {
    enabled?: boolean;
    bot_token?: string;
    chat_id?: string;
  } | null;
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });

  const next: StoredTelegramSettings = { ...(await readStoredTelegramSettings()) };

  if (typeof body.enabled === 'boolean') next.enabled = body.enabled;

  // Blank token = keep the saved one. Only a non-empty value replaces it.
  const token = typeof body.bot_token === 'string' ? body.bot_token.trim() : '';
  if (token) {
    if (!TELEGRAM_TOKEN_RE.test(token)) {
      return NextResponse.json(
        { error: 'That does not look like a Telegram bot token (expected 123456789:AA...).' },
        { status: 400 }
      );
    }
    next.bot_token = token;
  }

  if (typeof body.chat_id === 'string') {
    const chat = body.chat_id.trim();
    if (chat && !TELEGRAM_CHAT_ID_RE.test(chat)) {
      return NextResponse.json(
        { error: 'Chat ID should be a number (e.g. 987654321) or @channelname.' },
        { status: 400 }
      );
    }
    next.chat_id = chat;
  }

  const { error } = await getSupabaseAdmin()
    .from('admin_private_settings')
    .upsert(
      { key: TELEGRAM_SETTINGS_KEY, value: next, updated_at: new Date().toISOString() },
      { onConflict: 'key' }
    );
  if (error) {
    return NextResponse.json(
      { error: 'Could not save. Did you run the Supabase migration for admin_private_settings?' },
      { status: 500 }
    );
  }
  return NextResponse.json({ ok: true });
}

// POST { action: 'test' | 'detect_chat_id', bot_token?, chat_id? }
// Uses the values typed into the form if given, otherwise the saved ones.
export async function POST(req: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as {
    action?: string;
    bot_token?: string;
    chat_id?: string;
  };
  const cfg = await getTelegramConfig();
  const typedToken = (body.bot_token || '').trim();
  const token = typedToken || cfg.bot_token;
  if (!token) {
    return NextResponse.json({ error: 'Add a bot token first.' }, { status: 400 });
  }
  if (typedToken && !TELEGRAM_TOKEN_RE.test(typedToken)) {
    return NextResponse.json({ error: 'That does not look like a Telegram bot token.' }, { status: 400 });
  }

  if (body.action === 'detect_chat_id') {
    const r = await detectTelegramChatId(token);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json({ chat_id: r.chat_id, label: r.label });
  }

  if (body.action === 'test') {
    const chat = (body.chat_id || '').trim() || cfg.chat_id;
    if (!chat) return NextResponse.json({ error: 'Add a Chat ID first.' }, { status: 400 });
    const r = await sendTelegramMessage(token, chat, '✅ Test from your store admin. Telegram order alerts are working!');
    if (!r.ok) return NextResponse.json({ error: r.error || 'Telegram rejected the message' }, { status: 502 });
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
