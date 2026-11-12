// Server-only helpers for the Telegram new-order alert.
//
// The bot token is a secret. It is stored in the locked `admin_private_settings`
// table (RLS on, no policies -> unreachable with the public anon key) and is never
// sent back to the browser in full -- only a masked preview (see maskToken).
// Falls back to the TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID env vars when nothing is
// saved from the admin panel, so a Netlify-env-only setup keeps working.

import { getSupabaseAdmin } from './supabase-admin';

export const TELEGRAM_SETTINGS_KEY = 'telegram_notify';

export interface StoredTelegramSettings {
  enabled?: boolean;
  bot_token?: string;
  chat_id?: string;
}

export interface TelegramConfig {
  enabled: boolean;
  bot_token: string;
  chat_id: string;
  token_source: 'admin' | 'env' | 'none';
  chat_source: 'admin' | 'env' | 'none';
}

export const TELEGRAM_TOKEN_RE = /^\d{6,}:[A-Za-z0-9_-]{30,}$/;
export const TELEGRAM_CHAT_ID_RE = /^(-?\d+|@[A-Za-z0-9_]{4,})$/;

export function maskToken(token: string): string {
  if (!token) return '';
  if (token.length <= 12) return '••••••••';
  return `${token.slice(0, 4)}••••••••${token.slice(-4)}`;
}

export async function readStoredTelegramSettings(): Promise<StoredTelegramSettings> {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from('admin_private_settings')
      .select('value')
      .eq('key', TELEGRAM_SETTINGS_KEY)
      .maybeSingle();
    if (error) return {};
    return (data?.value as StoredTelegramSettings) ?? {};
  } catch {
    return {};
  }
}

export async function getTelegramConfig(): Promise<TelegramConfig> {
  const stored = await readStoredTelegramSettings();
  const envToken = (process.env.TELEGRAM_BOT_TOKEN || '').trim();
  const envChat = (process.env.TELEGRAM_CHAT_ID || '').trim();
  const storedToken = (stored.bot_token || '').trim();
  const storedChat = (stored.chat_id || '').trim();

  return {
    enabled: stored.enabled !== false,
    bot_token: storedToken || envToken,
    chat_id: storedChat || envChat,
    token_source: storedToken ? 'admin' : envToken ? 'env' : 'none',
    chat_source: storedChat ? 'admin' : envChat ? 'env' : 'none',
  };
}

export async function sendTelegramMessage(
  botToken: string,
  chatId: string,
  text: string
): Promise<{ ok: boolean; error?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
      signal: controller.signal,
    });
    if (res.ok) return { ok: true };
    const body = (await res.json().catch(() => null)) as { description?: string } | null;
    return { ok: false, error: body?.description || `Telegram responded ${res.status}` };
  } catch (err) {
    // Deliberately do not log/return the raw error: it can embed the request URL (= the token).
    const aborted = err instanceof Error && err.name === 'AbortError';
    return { ok: false, error: aborted ? 'Telegram timed out' : 'Could not reach Telegram' };
  } finally {
    clearTimeout(timer);
  }
}

// Finds the chat id of whoever last messaged the bot (used by the "Detect Chat ID" button).
export async function detectTelegramChatId(
  botToken: string
): Promise<{ ok: true; chat_id: string; label: string } | { ok: false; error: string; status: number }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/getUpdates`, {
      signal: controller.signal,
    });
    const body = (await res.json().catch(() => null)) as any;
    if (!res.ok || !body?.ok) {
      return { ok: false, status: 400, error: body?.description || 'Telegram rejected the token' };
    }
    const updates: any[] = Array.isArray(body.result) ? body.result : [];
    for (let i = updates.length - 1; i >= 0; i--) {
      const u = updates[i];
      const chat = u?.message?.chat || u?.channel_post?.chat || u?.my_chat_member?.chat;
      if (chat?.id != null) {
        const label = chat.username ? `@${chat.username}` : [chat.first_name, chat.last_name].filter(Boolean).join(' ') || chat.title || '';
        return { ok: true, chat_id: String(chat.id), label };
      }
    }
    return {
      ok: false,
      status: 404,
      error: 'No chat found yet. Open your bot in Telegram, press Start, send "hi", then try again.',
    };
  } catch (err) {
    const aborted = err instanceof Error && err.name === 'AbortError';
    return { ok: false, status: 502, error: aborted ? 'Telegram timed out' : 'Could not reach Telegram' };
  } finally {
    clearTimeout(timer);
  }
}
