# International - Phase 14 (India-only courier jobs no longer touch international orders)

## Problem
International parcels are saved with `tracking_number = <DHL/FedEx/Aramex AWB>` (Phase 6). Three places treated every `tracking_number` as a **Delhivery waybill**:
1. `runForwardShipmentTrackingJob` (cron) polled Delhivery for international AWBs - wasted API calls, errors in the cron log, and a risk of a wrong "arriving / delivered" email.
2. `runSplitShipmentTracking` (cron) did the same for multi-parcel international orders.
3. Chat widget "Track my order" (`/api/chat/order-lookup`, also used by `/track`) called Delhivery with the international AWB, and showed the total in INR.

## What changed
- `lib/cron-jobs.ts`: both tracking jobs skip `is_international` orders. India behaviour unchanged. International orders are marked delivered by you from Admin > Orders (same as before); that still triggers the delivered email and the review-request emails.
- `app/api/chat/order-lookup/route.ts`: no Delhivery call for international orders; returns `totalDisplay` (charged currency, via `orderMoney`), `isInternational`, and `trackingUrl` (courier link).
- `components/live-chat-widget.tsx`: chat text now shows "Total charged: $54.99" and "Track here: <link>" for international orders. India text unchanged.

## Apply
1. Copy the zip over the repo (no DB migration, no env var).
2. `npx tsc --noEmit` (passes).
3. `git add -A && git commit -m "International orders: skip Delhivery jobs and chat lookup" && git push`

## Test checklist
1. International order shipped with a DHL AWB: next cron run -> no Delhivery error for it in the cron log; `delivery_status` stays empty.
2. Chat widget > "Track my order" for that order: shows courier, AWB, "Track here" link, "Total charged" in USD; no rupee amount.
3. Admin sets it to delivered manually: delivered email in USD, and the review-request email goes out later as before.
4. India order (Delhivery): cron still updates delivery_status, arriving / out-for-delivery / delivered emails work, chat tracking shows live Delhivery location.
5. Split-shipment India order: parcels still tracked individually.

## Not changed on purpose
- `/api/orders/[id]/tracking` already handled international orders (Phase 6).
- Payment reminder cron only picks Razorpay/Cashfree orders, so Stripe orders never get an INR reminder.
- No automatic "delivered" for international (needs a courier API; use manual status).
