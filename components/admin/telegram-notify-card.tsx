'use client';

import { useEffect, useState } from 'react';
import { Save, Loader2, Send, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

// Admin > Settings > "Telegram Order Alerts".
// The saved bot token is never sent to the browser in full: the API returns a masked
// preview (e.g. 1234••••••••abcd) which is shown as the input's placeholder. Leave the
// field empty to keep the saved token; type/paste a new one to replace it.

type TelegramState = {
  enabled: boolean;
  chat_id: string;
  token_set: boolean;
  token_masked: string;
  token_source: 'admin' | 'env' | 'none';
  chat_source: 'admin' | 'env' | 'none';
};

export default function TelegramNotifyCard() {
  const [state, setState] = useState<TelegramState | null>(null);
  const [tokenInput, setTokenInput] = useState('');
  const [chatInput, setChatInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [testing, setTesting] = useState(false);
  const [detecting, setDetecting] = useState(false);

  const load = async () => {
    try {
      const res = await fetch('/api/admin/settings/telegram', { cache: 'no-store' });
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error || 'Failed');
      setState(d);
      setChatInput(d.chat_id || '');
    } catch {
      toast.error('Failed to load Telegram settings');
    }
  };

  useEffect(() => {
    load();
  }, []);

  const call = async (method: 'PUT' | 'POST', payload: Record<string, unknown>) => {
    const res = await fetch('/api/admin/settings/telegram', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d?.error || 'Something went wrong');
    return d;
  };

  const onToggle = async (checked: boolean) => {
    if (!state) return;
    setToggling(true);
    try {
      await call('PUT', { enabled: checked });
      setState({ ...state, enabled: checked });
      toast.success(checked ? 'Telegram alerts turned on' : 'Telegram alerts turned off');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setToggling(false);
    }
  };

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await call('PUT', { bot_token: tokenInput.trim(), chat_id: chatInput.trim() });
      setTokenInput('');
      await load();
      toast.success('Telegram settings saved');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const onDetect = async () => {
    setDetecting(true);
    try {
      const d = await call('POST', { action: 'detect_chat_id', bot_token: tokenInput.trim() });
      setChatInput(d.chat_id);
      toast.success(`Chat ID found${d.label ? ` (${d.label})` : ''}. Press Save.`);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setDetecting(false);
    }
  };

  const onTest = async () => {
    setTesting(true);
    try {
      await call('POST', { action: 'test', bot_token: tokenInput.trim(), chat_id: chatInput.trim() });
      toast.success('Test message sent. Check Telegram on your phone.');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setTesting(false);
    }
  };

  const tokenPlaceholder = state?.token_set
    ? `${state.token_masked}  (saved${state.token_source === 'env' ? ' via server env' : ''}, type to replace)`
    : '123456789:AAExxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';

  return (
    <>
      <div className="mt-8">
        <h2 className="font-serif text-2xl font-bold text-primary">Telegram Order Alerts</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Get an instant push notification on your phone (Telegram app) for every new order, even
          when the admin panel is closed. Create a bot with @BotFather, paste its token here,
          message your bot once, then press Detect Chat ID.
        </p>
      </div>

      {!state ? (
        <p className="py-4 text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="mt-4 max-w-xl space-y-4 rounded-lg border border-border/60 bg-card p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="telegram-enabled">{state.enabled ? 'Alerts on' : 'Alerts off'}</Label>
              <p className="text-xs text-muted-foreground">
                {state.enabled
                  ? 'On: every new order sends a Telegram message (once configured below).'
                  : 'Off: no Telegram message is sent.'}
              </p>
            </div>
            <Switch
              id="telegram-enabled"
              checked={state.enabled}
              disabled={toggling}
              onCheckedChange={onToggle}
            />
          </div>

          <form onSubmit={onSave} className="flex flex-col gap-4 border-t border-border/60 pt-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="telegram-token">Bot token</Label>
              <Input
                id="telegram-token"
                type="text"
                autoComplete="off"
                spellCheck={false}
                placeholder={tokenPlaceholder}
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Leave empty to keep the saved token. It is stored privately and never shown in full.
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="telegram-chat">Chat ID</Label>
              <div className="flex gap-2">
                <Input
                  id="telegram-chat"
                  type="text"
                  autoComplete="off"
                  placeholder="987654321"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={onDetect}
                  disabled={detecting || (!tokenInput.trim() && !state.token_set)}
                  className="shrink-0"
                >
                  {detecting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Search className="mr-1.5 h-4 w-4" />}
                  Detect Chat ID
                </Button>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={saving} className="bg-primary">
                <Save className="mr-1.5 h-4 w-4" /> {saving ? 'Saving…' : 'Save'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={onTest}
                disabled={testing || (!tokenInput.trim() && !state.token_set) || (!chatInput.trim())}
              >
                {testing ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Send className="mr-1.5 h-4 w-4" />}
                Send test message
              </Button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
