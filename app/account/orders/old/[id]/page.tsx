import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getCurrentUser } from '@/lib/supabase-server-auth';
import { getLegacyOrderDetail } from '@/lib/legacy-orders-api';
import { doesLegacyOrderBelongToEmail } from '@/lib/legacy-orders-customer';
import { formatINR } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { toPublicMediaUrl } from '@/lib/media-url';

export const dynamic = 'force-dynamic';

const STATUS_VARIANT: Record<string, string> = {
  completed: 'bg-green-100 text-green-800',
  delivered: 'bg-green-100 text-green-800',
  processing: 'bg-sky-100 text-sky-800',
  packed: 'bg-blue-100 text-blue-800',
  shipped: 'bg-indigo-100 text-indigo-800',
  'in-transit': 'bg-indigo-100 text-indigo-800',
  pending: 'bg-amber-100 text-amber-800',
  'on-hold': 'bg-amber-100 text-amber-800',
  cancelled: 'bg-red-100 text-red-800',
  failed: 'bg-red-100 text-red-800',
  refunded: 'bg-purple-100 text-purple-800',
};

const cleanStatus = (s: string) => (s ?? '').replace(/^wc-/, '');
const prettyStatus = (s: string) => cleanStatus(s).replace(/[-_]/g, ' ');

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso.endsWith('Z') || iso.includes('+') ? iso : `${iso}Z`);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}

export default async function OldOrderPage({ params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  // Old orders are matched by email, so the email must be verified.
  if (!user || !user.email || !user.email_confirmed_at) notFound();

  const orderId = Number(params.id);
  if (!Number.isInteger(orderId) || orderId <= 0) notFound();

  const owns = await doesLegacyOrderBelongToEmail(orderId, user.email);
  if (!owns) notFound();

  const order = await getLegacyOrderDetail(orderId);
  if (!order) notFound();

  const status = cleanStatus(order.status);
  const ship = order.shipping ?? order.billing;
  const shipName = ship ? [ship.first_name, ship.last_name].filter(Boolean).join(' ') : '';
  const shipAddress = ship
    ? [ship.address_1, ship.address_2, ship.city, ship.state, ship.postcode].filter(Boolean).join(', ')
    : '';

  return (
    <div>
      <Link
        href="/account/orders"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary"
      >
        <ArrowLeft className="h-4 w-4" /> Back to orders
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="font-serif text-2xl font-bold text-primary">Order #{order.id}</h1>
          <p className="text-xs text-muted-foreground">
            Placed on {formatDate(order.date_created_gmt)} · Earlier website order
          </p>
        </div>
        <Badge className={`capitalize ${STATUS_VARIANT[status] ?? 'bg-muted'}`}>{prettyStatus(order.status)}</Badge>
      </div>

      <div className="mt-6 space-y-3 rounded-lg border border-border/60 p-4">
        {order.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Item details are not available for this order.</p>
        ) : (
          order.items.map((it, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-md border bg-muted">
                {it.image_url ? (
                  <Image
                    src={toPublicMediaUrl(it.image_url) || it.image_url}
                    alt={it.name}
                    fill
                    sizes="56px"
                    className="object-cover"
                  />
                ) : null}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{it.name}</p>
                <p className="text-xs text-muted-foreground">
                  Qty {it.qty || 1}
                  {it.color ? ` · ${it.color}` : ''}
                  {it.size ? ` · ${it.size}` : ''}
                </p>
              </div>
              <p className="text-sm font-semibold text-primary">{formatINR(it.total)}</p>
            </div>
          ))
        )}
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-border/60 p-4">
          <h2 className="mb-2 text-sm font-semibold text-foreground">Delivery address</h2>
          <p className="text-sm text-foreground">{shipName || '—'}</p>
          <p className="text-sm text-muted-foreground">{shipAddress || '—'}</p>
        </div>

        <div className="rounded-lg border border-border/60 p-4">
          <h2 className="mb-2 text-sm font-semibold text-foreground">Payment summary</h2>
          {order.discount_total_amount > 0 && (
            <Row label="Discount" value={`- ${formatINR(order.discount_total_amount)}`} />
          )}
          <Row label="Shipping" value={order.shipping_total_amount > 0 ? formatINR(order.shipping_total_amount) : 'Free'} />
          {order.fees.map((f, i) => (
            <Row key={i} label={f.name} value={formatINR(f.total)} />
          ))}
          <div className="mt-1 border-t pt-1">
            <Row label="Order total" value={formatINR(order.total_amount)} />
          </div>
          <Row label="Payment" value={order.payment_method_title || order.payment_method || '—'} />
          {order.refunds.length > 0 && (
            <Row
              label="Refunded"
              value={formatINR(order.refunds.reduce((s, r) => s + Math.abs(r.total_amount), 0))}
            />
          )}
        </div>
      </div>

      <p className="mt-6 text-xs text-muted-foreground">
        This order was placed on our earlier website. Need help with it? Contact support and quote order #{order.id}.
      </p>
    </div>
  );
}
