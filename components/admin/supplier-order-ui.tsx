'use client';

import { useState } from 'react';
import {
  Check, CheckCircle2, Clock, Copy, Loader2, MessageCircle, PackageCheck, Search, ShoppingBag, Store, Trash2, Truck,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  SUPPLIER_LABEL, SUPPLIER_QUEUE_EXIT_STATUSES, SupplierOrder, SupplierSource, agoLabel, daysBetween, parseDateOnly,
  shortDate, todayLocalISO, waDigits,
} from '@/lib/supplier-order';

// Minimal shape of the admin Order this file needs (keeps it decoupled from
// the very large Order type inside orders-panel.tsx).
export interface SupplierUiOrder {
  id: string;
  status: string;
  created_at?: string;
  customer_name?: string;
  customer_phone?: string;
  shipping_address?: any;
  items: any[];
  supplier_order?: SupplierOrder | null;
  tracking_number?: string | null;
  _shipments?: { created_at: string }[];
  _item_sources?: Record<string, { source_name: string | null; whatsapp_name: string | null; whatsapp_number: string | null }>;
}

const SRC_STYLE: Record<SupplierSource, { chip: string; card: string; accent: string }> = {
  whatsapp: {
    chip: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    card: 'from-emerald-50 to-white border-emerald-200',
    accent: 'bg-emerald-500',
  },
  meesho: {
    chip: 'bg-fuchsia-100 text-fuchsia-800 border-fuchsia-200',
    card: 'from-fuchsia-50 to-white border-fuchsia-200',
    accent: 'bg-fuchsia-500',
  },
};

function shippedAt(o: SupplierUiOrder): Date | null {
  const s = o._shipments?.[0]?.created_at;
  return s ? new Date(s) : null;
}
function isLeftQueue(o: SupplierUiOrder) {
  return SUPPLIER_QUEUE_EXIT_STATUSES.includes(o.status) || (o._shipments?.length ?? 0) > 0 || !!o.tracking_number;
}
function isDead(o: SupplierUiOrder) {
  return ['cancelled', 'failed', 'refunded'].includes(o.status);
}
// Waiting-days colour: fresh = green, getting late = amber, late = red.
function ageTone(days: number) {
  if (days <= 1) return 'bg-emerald-100 text-emerald-800';
  if (days <= 3) return 'bg-amber-100 text-amber-800';
  return 'bg-red-100 text-red-700';
}

function deliveryText(o: SupplierUiOrder) {
  const a = o.shipping_address || {};
  const lines = [
    o.customer_name,
    o.customer_phone,
    [a.address, a.address2, a.landmark].filter(Boolean).join(', '),
    [a.city, a.state, a.pincode].filter(Boolean).join(', '),
  ].filter(Boolean);
  return lines.join('\n');
}
function itemText(o: SupplierUiOrder) {
  return o.items
    .map((it) => {
      const extra = [it.color && `Color: ${it.color}`, it.size && `Size: ${it.size}`, `Qty: ${Number(it.quantity) || 1}`].filter(Boolean).join(' | ');
      return `${it.product_name || 'Product'} (${extra})`;
    })
    .join('\n');
}
function whatsappSeller(o: SupplierUiOrder) {
  const pid = o.items.find((i) => i?.product_id && o._item_sources?.[i.product_id]?.whatsapp_number)?.product_id;
  return pid ? o._item_sources![pid] : null;
}
function whatsappUrl(o: SupplierUiOrder) {
  const seller = whatsappSeller(o);
  const text = `Hi${seller?.whatsapp_name ? ` ${seller.whatsapp_name}` : ''}, mujhe ye order karna hai:\n\n${itemText(o)}\n\nDelivery details:\n${deliveryText(o)}\n\nPlease confirm & payment details bhejein.`;
  const digits = waDigits(seller?.whatsapp_number);
  return `https://wa.me/${digits ?? ''}?text=${encodeURIComponent(text)}`;
}

// ── Date timeline shown inside the order row's Date cell ───────────────────
export function OrderDateTimeline({ order }: { order: SupplierUiOrder }) {
  if (!order.created_at) return null;
  const placed = new Date(order.created_at);
  const placedDays = daysBetween(placed);
  const ship = shippedAt(order);
  const dead = isDead(order);
  const wasShipped = !!ship || ['shipped', 'delivered'].includes(order.status);
  const sup = order.supplier_order;
  const supDate = sup ? parseDateOnly(sup.ordered_on) : null;

  const Row = ({ icon, label, children, dim }: { icon: React.ReactNode; label: string; children: React.ReactNode; dim?: boolean }) => (
    <div className={`flex items-start gap-2 ${dim ? 'opacity-60' : ''}`}>
      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">{icon}</span>
      <div className="min-w-0 leading-tight">
        <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
        <div className="flex flex-wrap items-center gap-1 text-xs">{children}</div>
      </div>
    </div>
  );
  const Pill = ({ className, children }: { className: string; children: React.ReactNode }) => (
    <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${className}`}>{children}</span>
  );

  return (
    <div className="space-y-1.5 rounded-lg border border-border/60 bg-gradient-to-br from-background to-muted/40 p-2">
      <Row icon={<ShoppingBag className="h-3 w-3" />} label="Customer order">
        <span className="font-medium">{shortDate(placed)}, {placed.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
        <Pill className={wasShipped || dead ? 'bg-muted text-muted-foreground' : ageTone(placedDays)}>{agoLabel(placedDays)}</Pill>
      </Row>

      {!dead && (
        <Row icon={<Store className="h-3 w-3" />} label="Supplier order" dim={!sup}>
          {sup && supDate ? (
            <>
              <span className="font-medium">{shortDate(supDate)}</span>
              <Pill className={`border ${SRC_STYLE[sup.source].chip}`}>{SUPPLIER_LABEL[sup.source]}</Pill>
              <Pill className="bg-muted text-muted-foreground">{agoLabel(daysBetween(supDate))}</Pill>
            </>
          ) : (
            <Pill className="border border-dashed border-amber-300 bg-amber-50 text-amber-800">Order karna baaki</Pill>
          )}
        </Row>
      )}

      {dead ? (
        <Row icon={<Clock className="h-3 w-3" />} label="Status"><Pill className="bg-red-100 text-red-700 capitalize">{order.status}</Pill></Row>
      ) : (
        <Row icon={<Truck className="h-3 w-3" />} label="Shipping" dim={!wasShipped && !sup}>
          {wasShipped ? (
            <>
              <span className="font-medium">{ship ? shortDate(ship) : 'Shipped'}</span>
              {ship && <Pill className="bg-emerald-100 text-emerald-800">{daysBetween(placed, ship) <= 0 ? 'Usi din' : `${daysBetween(placed, ship)} din me`}</Pill>}
            </>
          ) : (
            <Pill className={ageTone(placedDays)}>Ship baaki · {placedDays <= 0 ? 'aaj ka order' : `${placedDays} din se`}</Pill>
          )}
        </Row>
      )}
    </div>
  );
}

// ── Button + popup inside the Product cell ─────────────────────────────────
export function SupplierOrderControl({ order, onSaved }: { order: SupplierUiOrder; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const seller = whatsappSeller(order);
  const sup = order.supplier_order;
  const [source, setSource] = useState<SupplierSource>(sup?.source ?? (seller ? 'whatsapp' : 'meesho'));
  const [date, setDate] = useState(sup?.ordered_on ?? todayLocalISO());
  const [meeshoId, setMeeshoId] = useState(sup?.meesho_order_id ?? '');
  const [note, setNote] = useState(sup?.note ?? '');
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  if (isDead(order)) return null;
  if (!sup && isLeftQueue(order)) return null; // already shipped, nothing to record

  const openDialog = (src?: SupplierSource) => {
    setSource(src ?? sup?.source ?? (seller ? 'whatsapp' : 'meesho'));
    setDate(sup?.ordered_on ?? todayLocalISO());
    setMeeshoId(sup?.meesho_order_id ?? '');
    setNote(sup?.note ?? '');
    setOpen(true);
  };

  const call = async (method: 'PUT' | 'DELETE') => {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/orders/${order.id}/supplier-order`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: method === 'PUT' ? JSON.stringify({ source, ordered_on: date, meesho_order_id: meeshoId, note }) : undefined,
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Save nahi hua');
      toast.success(method === 'PUT' ? 'Supplier order save ho gaya' : 'Supplier order hata diya');
      setOpen(false);
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save nahi hua');
    } finally {
      setSaving(false);
    }
  };

  const copyDetails = async () => {
    try {
      await navigator.clipboard.writeText(`${itemText(order)}\n\n${deliveryText(order)}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('Copy nahi hua');
    }
  };

  const supDays = sup ? daysBetween(parseDateOnly(sup.ordered_on)) : 0;

  return (
    <>
      <div className="mt-1.5 flex flex-wrap items-center gap-1">
        {sup ? (
          <button
            type="button"
            onClick={() => openDialog()}
            title="Supplier order edit karein"
            className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${SRC_STYLE[sup.source].chip}`}
          >
            <CheckCircle2 className="h-3 w-3" />
            {SUPPLIER_LABEL[sup.source]} ordered · {agoLabel(supDays)}
            {sup.meesho_order_id ? ` · #${sup.meesho_order_id}` : ''}
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={() => openDialog()}
              className="flex items-center gap-1 rounded-full border border-primary/40 bg-primary/5 px-2 py-0.5 text-[10px] font-semibold text-primary hover:bg-primary/10"
            >
              <Store className="h-3 w-3" /> Supplier ko order
            </button>
            {seller && (
              <button
                type="button"
                onClick={() => {
                  window.open(whatsappUrl(order), '_blank', 'noopener');
                  openDialog('whatsapp');
                }}
                title="WhatsApp pe seedha order bhejein"
                className="flex items-center gap-1 rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-semibold text-white hover:bg-emerald-700"
              >
                <MessageCircle className="h-3 w-3" /> WhatsApp
              </button>
            )}
          </>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Supplier order</DialogTitle>
            <DialogDescription>Is customer ka product kahan se order kiya, wo yahan save karein.</DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-2">
            {(['whatsapp', 'meesho'] as SupplierSource[]).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSource(s)}
                className={`flex items-center justify-center gap-1.5 rounded-xl border-2 px-3 py-2.5 text-sm font-semibold transition ${
                  source === s ? `${SRC_STYLE[s].chip} border-current shadow-sm` : 'border-border bg-card text-muted-foreground'
                }`}
              >
                {s === 'whatsapp' ? <MessageCircle className="h-4 w-4" /> : <ShoppingBag className="h-4 w-4" />}
                {SUPPLIER_LABEL[s]}
              </button>
            ))}
          </div>

          <div className="rounded-lg border border-border/60 bg-muted/40 p-3 text-xs">
            <div className="mb-1 flex items-center justify-between">
              <span className="font-semibold uppercase tracking-wide text-muted-foreground">Order details</span>
              <button type="button" onClick={copyDetails} className="flex items-center gap-1 text-primary">
                {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />} {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <p className="whitespace-pre-line font-medium">{itemText(order)}</p>
            <p className="mt-2 whitespace-pre-line text-muted-foreground">{deliveryText(order)}</p>
          </div>

          {source === 'whatsapp' && (
            <Button
              type="button"
              variant="outline"
              className="gap-2 border-emerald-300 text-emerald-700 hover:bg-emerald-50"
              onClick={() => window.open(whatsappUrl(order), '_blank', 'noopener')}
            >
              <MessageCircle className="h-4 w-4" />
              {seller ? `WhatsApp pe order bhejein${seller.whatsapp_name ? ` (${seller.whatsapp_name})` : ''}` : 'WhatsApp kholein (number product source me nahi hai)'}
            </Button>
          )}

          <div className="grid gap-3">
            <label className="text-xs font-medium text-muted-foreground">
              Order date
              <Input type="date" value={date} max={todayLocalISO()} onChange={(e) => setDate(e.target.value)} className="mt-1" />
            </label>
            {source === 'meesho' && (
              <label className="text-xs font-medium text-muted-foreground">
                Meesho order ID (manual)
                <Input value={meeshoId} onChange={(e) => setMeeshoId(e.target.value)} placeholder="jaise 1234567890123456789" className="mt-1" />
              </label>
            )}
            <label className="text-xs font-medium text-muted-foreground">
              Note (optional)
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="jaise advance diya, 2 din me dispatch" className="mt-1" />
            </label>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            {sup ? (
              <Button type="button" variant="ghost" size="sm" className="gap-1 text-destructive" disabled={saving} onClick={() => call('DELETE')}>
                <Trash2 className="h-3.5 w-3.5" /> Hatao
              </Button>
            ) : <span />}
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="button" disabled={saving || !date} onClick={() => call('PUT')} className="gap-1.5">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── Top-of-page queue: ordered from supplier, waiting to ship ───────────────
export function SupplierQueue({ orders, onOpen }: { orders: SupplierUiOrder[]; onOpen: (orderId: string) => void }) {
  const queue = orders
    .filter((o) => o.supplier_order && !isLeftQueue(o))
    .sort((a, b) => a.supplier_order!.ordered_on.localeCompare(b.supplier_order!.ordered_on)); // oldest first
  if (queue.length === 0) return null;

  return (
    <section className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/5 via-background to-background p-3 shadow-sm sm:p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <PackageCheck className="h-4 w-4" />
          </span>
          <div>
            <h2 className="font-serif text-base font-bold leading-tight text-primary sm:text-lg">Supplier ko order ho gaya, ship baaki</h2>
            <p className="text-[11px] text-muted-foreground">Ship hote hi order yahan se hat jayega</p>
          </div>
        </div>
        <span className="rounded-full bg-primary px-2.5 py-1 text-xs font-bold text-primary-foreground">{queue.length}</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {queue.map((o) => {
          const sup = o.supplier_order!;
          const placed = o.created_at ? new Date(o.created_at) : new Date();
          const supDate = parseDateOnly(sup.ordered_on);
          const waited = daysBetween(supDate);
          const sinceCustomer = daysBetween(placed);
          const item = o.items[0];
          const style = SRC_STYLE[sup.source];
          return (
            <article key={o.id} className={`overflow-hidden rounded-xl border bg-gradient-to-br ${style.card} shadow-sm`}>
              <div className={`h-1 ${style.accent}`} />
              <div className="p-3">
                <div className="flex items-start gap-3">
                  {item?.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.image_url} alt="" className="h-14 w-14 shrink-0 rounded-lg border border-border/60 object-cover" />
                  ) : (
                    <div className="h-14 w-14 shrink-0 rounded-lg bg-muted" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{item?.product_name || 'Product'}{o.items.length > 1 ? ` +${o.items.length - 1}` : ''}</p>
                    <p className="truncate text-xs text-muted-foreground">{o.customer_name || 'Guest'} · #{o.id.slice(0, 8).toUpperCase()}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${style.chip}`}>{SUPPLIER_LABEL[sup.source]}</span>
                      {sup.meesho_order_id && <span className="rounded bg-white/80 px-1.5 py-0.5 font-mono text-[10px]">#{sup.meesho_order_id}</span>}
                    </div>
                  </div>
                  <span className={`shrink-0 rounded-lg px-2 py-1 text-center text-[10px] font-bold leading-tight ${ageTone(waited)}`}>
                    <span className="block text-base">{Math.max(waited, 0)}</span>din se<br />wait
                  </span>
                </div>

                {/* 3-step progress: customer -> supplier -> ship */}
                <ol className="mt-3 grid grid-cols-3 gap-1 text-center text-[10px]">
                  <li>
                    <span className="mx-auto mb-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground"><ShoppingBag className="h-3 w-3" /></span>
                    <span className="block font-semibold">{shortDate(placed)}</span>
                    <span className="text-muted-foreground">Customer · {agoLabel(sinceCustomer)}</span>
                  </li>
                  <li>
                    <span className={`mx-auto mb-1 flex h-5 w-5 items-center justify-center rounded-full text-white ${style.accent}`}><Store className="h-3 w-3" /></span>
                    <span className="block font-semibold">{shortDate(supDate)}</span>
                    <span className="text-muted-foreground">Supplier · {agoLabel(waited)}</span>
                  </li>
                  <li>
                    <span className="mx-auto mb-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-dashed border-muted-foreground/40 text-muted-foreground"><Truck className="h-3 w-3" /></span>
                    <span className="block font-semibold text-muted-foreground">Ship baaki</span>
                    <span className="text-muted-foreground">abhi nahi</span>
                  </li>
                </ol>

                {sup.note && <p className="mt-2 truncate text-[11px] italic text-muted-foreground">“{sup.note}”</p>}

                <button
                  type="button"
                  onClick={() => onOpen(o.id)}
                  className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-border/70 bg-white/80 py-1.5 text-xs font-medium text-primary hover:bg-white"
                >
                  <Search className="h-3.5 w-3.5" /> Order kholein / ship karein
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

