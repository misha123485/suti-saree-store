// Minimal Stripe client over the REST API (no npm package => package-lock.json stays untouched).
// Used ONLY for international orders. India keeps Razorpay / Cashfree.
import crypto from 'crypto';

const STRIPE_API = 'https://api.stripe.com/v1';
// Pinned so Stripe dashboard upgrades can never change behaviour under us.
export const STRIPE_API_VERSION = '2024-06-20';

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

type Param = string | number | boolean | null | undefined | Param[] | { [k: string]: Param };

/** Stripe wants application/x-www-form-urlencoded with bracket notation for nesting. */
export function encodeStripeParams(obj: Param, prefix = '', out: string[] = []): string {
  if (obj === null || obj === undefined) return out.join('&');
  if (Array.isArray(obj)) {
    obj.forEach((v, i) => encodeStripeParams(v, `${prefix}[${i}]`, out));
  } else if (typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) {
      if (v === undefined || v === null) continue;
      encodeStripeParams(v, prefix ? `${prefix}[${k}]` : k, out);
    }
  } else {
    out.push(`${encodeURIComponent(prefix)}=${encodeURIComponent(String(obj))}`);
  }
  return out.join('&');
}

export async function stripeFetch<T = any>(
  method: 'GET' | 'POST',
  path: string,
  params?: Record<string, Param>,
  opts: { idempotencyKey?: string } = {},
): Promise<{ ok: true; data: T } | { ok: false; error: string; status: number }> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return { ok: false, error: 'Stripe is not configured', status: 500 };
  const headers: Record<string, string> = {
    Authorization: `Bearer ${key}`,
    'Stripe-Version': STRIPE_API_VERSION,
  };
  let url = `${STRIPE_API}${path}`;
  let body: string | undefined;
  if (method === 'POST') {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    body = encodeStripeParams(params || {});
    if (opts.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey;
  } else if (params) {
    const qs = encodeStripeParams(params);
    if (qs) url += `?${qs}`;
  }
  try {
    const res = await fetch(url, { method, headers, body, cache: 'no-store' });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: json?.error?.message || `Stripe error ${res.status}`, status: res.status };
    }
    return { ok: true, data: json as T };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Stripe request failed', status: 502 };
  }
}

/** Stripe says: signed payload = `${t}.${rawBody}`, HMAC-SHA256 with the whsec_ secret, header `t=..,v1=..`. */
export function verifyStripeWebhook(rawBody: string, header: string | null, toleranceSec = 300): boolean {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !header) return false;
  const parts = header.split(',').map((p) => p.trim().split('='));
  const t = parts.find(([k]) => k === 't')?.[1];
  const sigs = parts.filter(([k]) => k === 'v1').map(([, v]) => v);
  if (!t || sigs.length === 0) return false;
  if (Math.abs(Date.now() / 1000 - Number(t)) > toleranceSec) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${t}.${rawBody}`, 'utf8').digest('hex');
  const eb = Buffer.from(expected, 'hex');
  return sigs.some((s) => {
    try {
      const sb = Buffer.from(s, 'hex');
      return sb.length === eb.length && crypto.timingSafeEqual(sb, eb);
    } catch {
      return false;
    }
  });
}

/** Stripe wants the 3-decimal currencies (OMR/BHD/KWD) divisible by 10; the SQL formula already guarantees it. */
export function normalizeStripeMinor(amountMinor: number, currency: string): number {
  const three = ['OMR', 'BHD', 'KWD'].includes(currency.toUpperCase());
  return three ? Math.round(amountMinor / 10) * 10 : Math.round(amountMinor);
}

export async function refundStripePayment(
  paymentIntentId: string,
  amountMinor: number | null,
  idempotencyKey: string,
): Promise<{ success: true; refundId: string } | { success: false; error: string }> {
  const res = await stripeFetch<{ id: string }>(
    'POST',
    '/refunds',
    { payment_intent: paymentIntentId, ...(amountMinor ? { amount: amountMinor } : {}) },
    { idempotencyKey },
  );
  if (!res.ok) return { success: false, error: res.error };
  return { success: true, refundId: res.data.id };
}
