# International - Phase 13 (emails + returns for international customers)

## Problems fixed
1. Customer emails for international orders showed INR (item prices and totals): "payment received" (sent by Stripe webhook), admin status changes (shipped / delivered / cancelled), customer self-cancel, return status, refund processed. A US customer who paid $54.99 was told "Total: Rs 4,950" and "refund via Razorpay".
2. Approving a return on an international order auto-created a **Delhivery reverse pickup** with a foreign address (fails, alerts admin, and sends a wrong email). Our returns policy says the buyer ships it back.

## What changed
- `lib/email-templates.ts`: new optional `money` (the order row) on `orderStatusUpdateEmail`, `orderCancelledByCustomerEmail`, `returnRefundProcessedEmail`, and `money` + `intlReturnDays` on `returnStatusEmail`. For international orders: names-only item list, total/refund in the charged currency (same `orderMoney()` as the order pages), "original card" wording, refund timeline 5-10 days, currency note, duty notice on paid/shipped/delivered, and return instructions in the "approved" return email. No `money` = India email, unchanged.
- Callers pass the order: `lib/stripe-mark-paid.ts`, `lib/orders-api.ts`, `app/api/orders/[id]/cancel`, `lib/return-automation.ts`, `app/api/admin/returns/[id]` (+ refund / schedule-pickup / check-pickup routes and `lib/cron-jobs.ts` now select `is_international, charge_currency, charge_amount_minor`).
- `lib/return-automation.ts`: `schedulePickupForReturn` does nothing for international orders (no Delhivery call, no alert) and returns a clear message. Refund after you receive the parcel works as before (Admin > Returns > refund -> Stripe, original currency).
- `scripts/test-intl-emails.ts`: 13 checks.

## Apply
1. Copy the zip over the repo (no DB migration, no env var).
2. `npx tsx scripts/test-intl-emails.ts` -> ALL PASS.
3. `git add -A && git commit -m "International orders: emails and returns in charged currency" && git push`

## Test checklist
1. Stripe TEST order (US): the "payment received" email shows USD and the duty notice, no rupee sign.
2. Cancel that order from the order page (customer self-cancel): email shows "Refund of $..." and "original card".
3. Admin sets another international order to shipped / delivered / cancelled: emails in USD.
4. Create a return on an international order, Approve: customer gets "How to send it back"; no Delhivery pickup, no admin alert. "Schedule pickup" button shows the international message (expected).
5. After the parcel arrives: Admin > Returns > refund. Email says "$... via Stripe". Stripe dashboard shows the refund.
6. India order: cancel, return approve (pickup is scheduled), refund -> emails identical to before (INR, Razorpay/Cashfree wording).

## Not changed on purpose
- Delhivery "arriving" / "out for delivery" emails (India courier only, never sent for international).
- Admin-side emails (new order alert, return alert) stay in INR for your own books.
- Exchange emails (Hinglish text) are not currency based.
