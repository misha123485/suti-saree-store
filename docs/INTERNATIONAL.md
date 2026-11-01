# International selling - operations guide (Phases 1-10)

## What it is
Prepaid international orders paid by card through Stripe (India account, export enabled). India orders keep using
Razorpay / Cashfree / COD / Delhivery exactly as before. Everything is behind the master switch
**Admin > Settings > International Selling** (default OFF). Customers pay in their country's currency; the
database (`place_order_with_items`) computes the final amount, shipping and currency - the browser is never trusted.

## Settings (Admin > Settings > International Selling)
- Master switch (cannot be turned on unless at least one enabled country is covered by an active zone).
- Countries: enable per country (UK only after your UK VAT decision).
- Shipping zones: countries, base rate (covers 500 g), extra per further 500 g, free-shipping threshold, minimum order, ETA, courier.
- FX rates (INR per 1 unit), FX markup %, international price markup %, price rounding (x.99), DAP/DDP, return window.
- Admin-only costs: Stripe fee %, fixed fee, chargeback fee, fallback cost %.
- Export details (IEC, GSTIN, LUT, AD code, HS code) for the export invoice.

## Add a new country
1. Settings > International: enable the country (the 11 supported countries are pre-seeded).
2. Add it to an active zone (or create a zone). 3. Check FX rate for its currency.
4. Use the Break-even helper (Admin > International P&L). 5. Add its Merchant Center feed (Marketing > Merchant Feed lists the URL).
(A country outside the 11 needs a row in `intl_countries` and, for a new currency, an entry in `SUPPORTED_CURRENCIES` in `lib/intl-api.ts` plus the SQL currency function - ask a developer.)

## Change FX rates
Settings > International > FX rates. Prices on the site, in checkout, in the order and in the Merchant feed all use the same formula, so they change together
(Merchant Center re-fetches daily; expect a short window where Google's cached price differs - that is why you change rates rarely).

## Refund
Admin > Returns > process refund. International orders are refunded to the customer's card through Stripe in the ORIGINAL currency
(pro-rata from the INR amount). Duties/taxes paid to customs are not refundable by us. Chargebacks appear as a badge on the order.

## Read the P&L
Admin > International P&L. See `docs/INTERNATIONAL_PHASE9.md`. Enter product costs once, courier cost in the International shipment form,
optionally the real Stripe settlement per order.

## End-to-end test (Stripe TEST mode, US and UAE)
1. Switch ON; enable US/UAE with a zone that has real rates. 2. Open `/?cc=US`: prices in USD. Add a product, checkout, accept the duty box.
3. Pay with `4000 0027 6000 3184` (3D Secure) - order becomes paid, confirmation email arrives (webhook: `stripe listen --forward-to localhost:3000/api/stripe/webhook`).
4. Admin > Orders: International shipment (courier, AWB) - tracking email goes out. 5. Download the export invoice.
6. Refund from Returns - Stripe shows the refund. 7. Admin > International P&L shows the row. Repeat with `?cc=AE`.

## Failure tests (all must be rejected / handled)
- India address on the Stripe path -> 400. - Changing amount in the browser -> ignored (server recomputes). - Same webhook sent twice -> second is a no-op.
- Close the Stripe tab, go back to checkout and retry -> same order, same open session. - COD / partial for an international order -> rejected.
- Country disabled, or master switch OFF after placing the order -> no new payment session (409). - Order below the zone minimum -> rejected.
- Wrong webhook signature -> 400. - Webhook amount/currency different from the order -> order stays pending.

## India regression checklist
Razorpay, Cashfree, COD, partial/advance, coupons, BOGO, store credit, affiliate, pincode checker, Delhivery shipment, invoice PDF, GST report,
India Merchant feed (`/api/merchant-feed`), sitemap, robots - all unchanged with the switch OFF.

## Security review summary (Phase 10)
Checked: every `/api/admin/international/*` route uses `requireAdmin()`; Stripe webhook verifies HMAC with timing-safe compare and a 5-minute tolerance
and checks amount + currency; create-session reads amount from the DB, blocks India addresses, is rate limited, reuses open sessions, uses idempotency keys;
secrets live only in env vars; admin-only settings keys and `product_costs` are unreadable with the public key (verify with `INTERNATIONAL_PHASE10_VERIFY.sql`).
Fixed in Phase 10: create-session now refuses when International Selling or the country was switched off after the order was placed.
Known / accepted: (1) the create-session rate limit is per serverless instance (best effort); orders are UUIDs so guessing is impractical, same model as Cashfree.
(2) The public config endpoint exposes the FX markup % (needed for price display); it is not a secret but reveals part of your margin.
(3) `?cc=` pages are crawlable on purpose (Google Shopping must open them) and carry a canonical Link header to the clean URL.
