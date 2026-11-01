// Shared (client + server) helpers for "ordered from supplier" tracking
// (WhatsApp seller / Meesho) on Admin > Orders.

export type SupplierSource = 'whatsapp' | 'meesho';

export interface SupplierOrder {
  source: SupplierSource;
  /** YYYY-MM-DD, chosen manually by the admin */
  ordered_on: string;
  meesho_order_id?: string | null;
  note?: string | null;
  updated_at?: string;
}

export const SUPPLIER_LABEL: Record<SupplierSource, string> = {
  whatsapp: 'WhatsApp',
  meesho: 'Meesho',
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function clean(v: unknown, max: number): string {
  // eslint-disable-next-line no-control-regex
  return typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max) : '';
}

export function todayLocalISO(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Returns a sanitised SupplierOrder or an error string. */
export function validateSupplierOrder(raw: any): SupplierOrder | string {
  const source = raw?.source;
  if (source !== 'whatsapp' && source !== 'meesho') return 'Source WhatsApp ya Meesho chuniye';
  const ordered_on = clean(raw?.ordered_on, 10);
  if (!DATE_RE.test(ordered_on) || isNaN(new Date(`${ordered_on}T00:00:00Z`).getTime())) {
    return 'Order date sahi nahi hai';
  }
  // Allow "tomorrow" to absorb timezone differences, nothing further.
  if (new Date(`${ordered_on}T00:00:00Z`).getTime() > Date.now() + 36 * 3_600_000) {
    return 'Order date future ki nahi ho sakti';
  }
  const meesho = clean(raw?.meesho_order_id, 60);
  const note = clean(raw?.note, 200);
  return {
    source,
    ordered_on,
    meesho_order_id: source === 'meesho' && meesho ? meesho : null,
    note: note || null,
    updated_at: new Date().toISOString(),
  };
}

// ── Day maths (calendar days in the browser's local time) ───────────────────
function startOfLocalDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
export function parseDateOnly(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}
export function daysBetween(from: Date, to: Date = new Date()): number {
  return Math.round((startOfLocalDay(to).getTime() - startOfLocalDay(from).getTime()) / 86_400_000);
}
export function agoLabel(days: number): string {
  if (days <= 0) return 'Aaj';
  if (days === 1) return '1 din pehle';
  return `${days} din pehle`;
}
export function shortDate(d: Date): string {
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

/** Normalises a seller number to wa.me digits (defaults to +91). */
export function waDigits(num: string | null | undefined): string | null {
  let digits = String(num ?? '').replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  if (digits.length === 10) digits = `91${digits}`;
  return digits.length < 11 ? null : digits;
}

/** Orders that are already with the courier / finished -> leave the queue. */
export const SUPPLIER_QUEUE_EXIT_STATUSES = ['shipped', 'delivered', 'cancelled', 'failed', 'returned', 'refunded'];
