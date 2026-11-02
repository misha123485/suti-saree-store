# International - Phase 12 (customer order pages show the currency actually charged)

## Problem
Order pages used `formatINR()`, which converts only when the visitor's country cookie is set. A US customer opening
the confirmation / tracking link from an email (no cookie, or the server render) saw INR instead of the USD they paid.

## What changed
- New `lib/order-money.ts`: `orderMoney(order, inrAmount)` reads the ORDER (`is_international`, `charge_currency`,
  `charge_amount_minor`). Order total = exact charged amount; other lines are scaled by the same ratio.
  India orders still show plain INR, identical to before.
- Used on: order confirmation, track page, account orders list, account order detail.
- No DB change, no env var. `scripts/test-order-money.ts` has 9 checks.

## Apply
1. Copy the zip over the repo. 2. `git add -A && git commit -m "International orders: show charged currency on order pages" && git push`.

## Test checklist
1. Open a paid US order's `/order-confirmation/<id>` in a private window (no cookie): amounts in USD, total equals what Stripe charged.
2. Same for `/track/<id>` and `/account/orders` + order detail.
3. An India order: all pages unchanged (INR).
4. `npx tsx scripts/test-order-money.ts` -> ALL PASS.

## Not changed on purpose
Loyalty points value, advance/balance lines (COD/partial are India-only) and the Hindi/old-site orders keep `formatINR`.
`app/components/account/AccountOrdersPage.tsx` is not imported anywhere, so it was left alone.
