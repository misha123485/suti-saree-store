# International - Phase 11 (per-product "Do not export" flag)

Closes the item left open in Phase 8.

## Apply
1. Copy the zip over the repo. 2. Run `supabase/migrations/20261106000000_products_export_blocked.sql` in Supabase (adds `products.export_blocked`, default false; safe to re-run).
3. `git add -A && git commit -m "International orders: per-product export block" && git push`. No env var.

## How to use
Admin > Configuration > International P&L > **Product costs**: search the product, tick **Do not export**, Save.

## What a blocked product does
- Country Merchant feeds (`/api/merchant-feed?country=US` etc.) skip it. The India feed is untouched.
- International checkout: before any order is created, the customer sees "Not available for international delivery: <name>. Please remove it from your cart."
- Server-side backstop: `/api/stripe/create-session` refuses to start a payment for an order containing a blocked product (409), even if the browser check is bypassed.
- India orders are not affected at all.

## Test checklist
1. Tick a product, Save, reload: tick persists. 2. Open `/api/merchant-feed?country=US`: product missing; India feed still has it.
3. `?cc=US` checkout with that product in cart: error message, no order created. Remove it: checkout works.
4. India checkout with that product: works normally. 5. Untick: it returns to the US feed after the next fetch.
Note: if the migration is not applied yet, nothing is blocked and the toggle save shows "Run migration ... first".
