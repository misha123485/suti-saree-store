# International – Phase 6 (Fulfilment, Export Invoice, GST)

## Apply
1. Copy the files from the zip over the repo (same paths), then run `npx tsc --noEmit`.
2. Supabase SQL editor: run `supabase/migrations/20261104000000_international_fulfilment.sql` (additive; India untouched).
3. Admin > Settings > International Selling > Export details: fill IEC, GSTIN, LUT number + date, AD code, default HS code
   (without these the export invoice prints blank IEC / LUT lines).
4. `git add -A && git commit -m "International orders: Phase 6 fulfilment + export invoice + GST" && git push`

## What changed
- `POST /api/admin/international/ship` (admin only): saves courier + AWB + tracking link + dispatch date + actual courier cost / duty / HS code,
  creates an `order_shipments` row (partial parcels work), moves order to `shipped`, emails the customer. Only allowed once the order is `paid`.
- Admin > Orders: international orders show an `INTL · XX / Stripe / amount / DAP` badge; "Create Shipment" becomes "Add International AWB"
  and opens the new form instead of Delhivery. India orders unchanged.
- `/api/orders/[id]/tracking` + `OrderTracking`: international orders show courier, AWB, dispatch date, "Track on courier site" link and the zone ETA (no Delhivery call).
- `/api/invoice/[id]`: international orders get the EXPORT INVOICE (LUT line, IEC/GSTIN/AD code, HS code, charge currency + INR, DAP/DDP). Same link works from Admin and the order confirmation page.
- GST report: international orders are removed from the domestic GSTR-1/3B maths and shown in a separate "Exports (LUT)" card, with CSV `type=exports`.
- Emails: new `orderShippedInternationalEmail`; the order-confirmation email for international orders shows the charge currency, duty notice (DAP/DDP) and return window.

## TEST CHECKLIST
1. India COD/online order: Create Shipment still opens the Delhivery popup; invoice is the normal GST invoice; GST report totals unchanged vs. before.
2. International order (Stripe TEST, status Paid): badge shows; button says "Add International AWB"; form opens; empty AWB / bad HS code rejected.
3. Save with DHL + AWB: status -> Shipped, customer email has AWB, tracking button, duty notice, return days. Track page shows the courier link + ETA.
4. Order with 2 items: untick one item -> "Parcel 1", remaining item shown as "still to ship"; ship it with a second AWB. Re-using an AWB is rejected.
5. Pending (unpaid) international order: shipping is refused with a clear message.
6. Download invoice for the international order: "EXPORT INVOICE", LUT line, goods + shipping = Total charged, INR equivalent + rate.
7. GST report for the month: domestic numbers exclude the export order; "Exports (LUT)" card shows count/INR; CSV has invoice no, country, currency, amount, INR, FX, AWB, HS.
8. Confirmation email of a new international order: total in USD/AED etc., not ₹.

## Known limits
- Export invoice uses the built-in Helvetica font, so non-Latin characters (Arabic/Chinese names) print as `?`. Switch to an embedded Unicode font later if needed.
- Refunded export orders are not netted off in the Exports CSV (record credit notes manually with your CA).
- WhatsApp "send tracking" button is not added for international parcels (email only).
