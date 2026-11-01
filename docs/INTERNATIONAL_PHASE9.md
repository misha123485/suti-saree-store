# International – Phase 9 (Profit & Loss)

## Apply
1. Copy the zip files over the repo (same paths).
2. **Run the migration in Supabase SQL editor:** `supabase/migrations/20261105000000_international_pnl.sql`
   (creates admin-only `product_costs`, adds `orders.actual_settlement_inr` and `orders.intl_ad_spend_inr`; safe to re-run).
3. `npx tsc --noEmit` and `npx tsx scripts/test-intl-pnl.ts`
4. `git add -A && git commit -m "International orders: Phase 9 profit and loss" && git push`
No new env var.

## Where to find it
- **Admin > Configuration > International P&L** (new): date range + country filter, summary cards, per-country table,
  orders table (loss-making rows in red, totals row), CSV export, P&L assumptions, Product costs, Break-even helper.
- **Admin > Dashboards**: small "International · this month" card (orders, revenue, profit, margin). Hidden while International Selling is OFF.

## IMPORTANT: product cost
The product form's "Safe Profit" cost is kept only in your browser (localStorage), so the server had no cost to use.
Enter your real costs once in **International P&L > Product costs** (admin-only table, never visible to customers).
Orders with products that have no cost show a yellow warning and a ⚠ in the table: their profit is overstated.
Optional: set "Fallback cost %" (assumes cost = X% of selling price when no cost is saved).

## How profit is computed (per order, integer paise, no float money bugs)
revenue = charged amount x fx_rate_used
- Stripe fee (fee % + fixed fee)            -> or the REAL gap (revenue - settlement) if you enter "Settlement ₹"
- FX loss (fx_markup_percent)               -> 0 when settlement is entered (payout already contains it)
- product cost (product_costs, else fallback %)
- packaging (Settings > Shipping "other charges")
- courier (actual from the International shipment form; else zone-rate estimate, marked ~)
- duty (only DDP orders, from the shipment form)
- refunds (returns refunded/completed, capped at revenue)
- chargeback (lost dispute: remaining revenue + dispute fee; won disputes cost nothing)
- ad spend (optional per-order input)
= net profit, margin = profit / revenue.
Pending / cancelled / failed / expired orders are excluded.

## Break-even helper
Pick country, price, your cost, what the courier bills you. It shows profit for one order and the minimum order value
(same cost-to-price ratio, zone shipping fee) at which profit >= 0, and warns when the zone's `min_order_inr` is lower.
Packaging is not included in the helper (the real P&L includes it).

## Worked examples (also asserted in scripts/test-intl-pnl.ts)
Settings: Stripe 3%, FX markup 2%, packaging ₹50.
- **Profitable:** $79.99 @ ₹90 = ₹7,199.10 - Stripe 215.97 - FX 143.98 - cost 2,500 - packing 50 - courier 1,800 = **₹2,489.15 (34.6%)**
- **Loss-making:** $39.99 @ ₹90 = ₹3,599.10 - Stripe 107.97 - FX 71.98 - cost 2,000 - packing 50 - courier 2,200 = **-₹830.85 (-23.1%)**

## Test checklist
1. Run the migration; open Admin > International P&L: page loads (empty table is fine before any international order).
2. Product costs: search a product, enter a cost, Save. Reload: the cost is still there.
3. Place a Stripe TEST international order, mark it shipped with courier cost in the International shipment form.
   It appears in the table with the correct revenue; profit matches the formula above.
4. Order with a product that has no cost: ⚠ + yellow banner. Save its cost: warning disappears.
5. Type a Settlement ₹ on an order: "Stripe+FX" becomes revenue - settlement. Clear it: estimate returns.
6. Refund the order (Admin > Returns): refunds column fills, profit drops.
7. CSV button downloads a file whose TOTAL row matches the screen.
8. Break-even: set courier cost higher than the zone shipping fee: a minimum order value shows, and the amber warning appears if zone min order is lower.
9. Dashboards tab: "International · this month" card shows; turn International Selling OFF: card disappears.
10. India orders and the GST report are untouched (nothing in this phase changes them).
