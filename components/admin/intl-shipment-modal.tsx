'use client';

import { useEffect, useState } from 'react';
import { Globe, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { INTL_COURIERS, intlTrackingUrl } from '@/lib/intl-shipping';
import { getUnshippedItemIndexes, type OrderShipment } from '@/lib/shipments';

export interface IntlShipmentPayload {
  courier: string;
  courierOther?: string;
  awb: string;
  trackingUrl?: string;
  dispatchDate: string;
  actualCourierCostInr?: string;
  actualDutyPaidInr?: string;
  exportHsCode?: string;
  itemIndexes: number[];
}

const todayIso = () => new Date().toISOString().slice(0, 10);

/** International counterpart of CreateShipmentModal: no courier API, admin enters the AWB. */
export default function IntlShipmentModal({
  open,
  onOpenChange,
  orderLabel,
  countryCode,
  dutyMode,
  items = [],
  shipments = [],
  defaultHsCode = '',
  confirming,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderLabel: string;
  countryCode?: string;
  dutyMode?: string;
  items?: any[];
  shipments?: Pick<OrderShipment, 'item_indexes'>[];
  defaultHsCode?: string;
  confirming: boolean;
  onConfirm: (p: IntlShipmentPayload) => void;
}) {
  const [courier, setCourier] = useState<string>('DHL');
  const [courierOther, setCourierOther] = useState('');
  const [awb, setAwb] = useState('');
  const [trackingUrl, setTrackingUrl] = useState('');
  const [dispatchDate, setDispatchDate] = useState(todayIso());
  const [courierCost, setCourierCost] = useState('');
  const [dutyPaid, setDutyPaid] = useState('');
  const [hs, setHs] = useState(defaultHsCode);

  const unshipped = getUnshippedItemIndexes(items, shipments as any);
  const unshippedKey = unshipped.join(',');
  const [selected, setSelected] = useState<number[]>(unshipped);

  useEffect(() => {
    if (open) {
      setSelected(unshipped);
      setAwb('');
      setTrackingUrl('');
      setCourierCost('');
      setDutyPaid('');
      setDispatchDate(todayIso());
      setHs(defaultHsCode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, unshippedKey, defaultHsCode]);

  const autoUrl = intlTrackingUrl(courier, awb);
  const toggle = (i: number) =>
    setSelected((cur) => (cur.includes(i) ? cur.filter((x) => x !== i) : [...cur, i].sort((a, b) => a - b)));

  const submit = () => {
    if (!awb.trim()) return toast.error('Enter the AWB / tracking number');
    if (courier === 'Other' && !courierOther.trim()) return toast.error('Enter the courier name');
    if (courier === 'Other' && !trackingUrl.trim()) return toast.error('Paste the courier tracking link for "Other" couriers');
    if (selected.length === 0) return toast.error('Select at least one item for this parcel');
    onConfirm({
      courier,
      courierOther: courierOther.trim() || undefined,
      awb: awb.trim(),
      trackingUrl: trackingUrl.trim() || undefined,
      dispatchDate,
      actualCourierCostInr: courierCost.trim() || undefined,
      actualDutyPaidInr: dutyPaid.trim() || undefined,
      exportHsCode: hs.trim() || undefined,
      itemIndexes: selected,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-serif text-xl text-primary">
            <Globe className="h-5 w-5" /> International shipment
          </DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          Order <b>{orderLabel}</b>
          {countryCode ? <> → <b>{countryCode}</b></> : null}
          {dutyMode ? <> · Duty mode: <b>{dutyMode}</b></> : null}. Book the parcel in your courier&apos;s portal, then enter the AWB here.
          The customer is emailed the tracking link and duty notice.
        </p>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs font-medium">
              Courier
              <select
                value={courier}
                onChange={(e) => setCourier(e.target.value)}
                className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                {INTL_COURIERS.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </label>
            <label className="text-xs font-medium">
              Dispatch date
              <Input type="date" value={dispatchDate} max={todayIso()} onChange={(e) => setDispatchDate(e.target.value)} className="mt-1" />
            </label>
          </div>

          {courier === 'Other' && (
            <label className="block text-xs font-medium">
              Courier name
              <Input value={courierOther} onChange={(e) => setCourierOther(e.target.value)} placeholder="e.g. Skynet" className="mt-1" />
            </label>
          )}

          <label className="block text-xs font-medium">
            AWB / tracking number
            <Input value={awb} onChange={(e) => setAwb(e.target.value)} placeholder="e.g. 1234567890" className="mt-1" />
          </label>

          <label className="block text-xs font-medium">
            Tracking link {courier !== 'Other' && <span className="font-normal text-muted-foreground">(auto-filled — change only if needed)</span>}
            <Input value={trackingUrl} onChange={(e) => setTrackingUrl(e.target.value)} placeholder={autoUrl || 'https://…'} className="mt-1" />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs font-medium">
              Actual courier cost (₹)
              <Input type="number" min={0} value={courierCost} onChange={(e) => setCourierCost(e.target.value)} className="mt-1" />
            </label>
            <label className="text-xs font-medium">
              Duty paid by us (₹) {dutyMode !== 'DDP' && <span className="font-normal text-muted-foreground">— DDP only</span>}
              <Input type="number" min={0} value={dutyPaid} onChange={(e) => setDutyPaid(e.target.value)} className="mt-1" />
            </label>
          </div>

          <label className="block text-xs font-medium">
            Export HS code
            <Input value={hs} onChange={(e) => setHs(e.target.value)} placeholder="e.g. 54075200" className="mt-1" />
          </label>

          {unshipped.length > 1 && (
            <div>
              <p className="mb-1 text-xs font-medium">Items in this parcel (untick to ship the rest later)</p>
              <ul className="space-y-1 rounded-md border border-border/60 p-2">
                {unshipped.map((i) => (
                  <li key={i}>
                    <label className="flex cursor-pointer items-center gap-2 text-sm">
                      <input type="checkbox" checked={selected.includes(i)} onChange={() => toggle(i)} />
                      <span className="truncate">
                        {items[i]?.product_name || 'Item'} {items[i]?.size ? `· ${items[i].size}` : ''} × {items[i]?.quantity ?? 1}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={confirming}>Cancel</Button>
          <Button onClick={submit} disabled={confirming} className="gap-2">
            {confirming && <Loader2 className="h-4 w-4 animate-spin" />} Mark shipped &amp; email customer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
