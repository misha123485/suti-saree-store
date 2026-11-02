# International - Phase 16 (starter shipping rates + duty note)

## What this is
One SQL migration: `supabase/migrations/20261107000000_international_default_rates.sql`. No app code, no env var.

| Zone | Courier | Base Rs (500g) | Extra Rs/500g | 1 saree (700g) | Free from Rs | Min order Rs |
|---|---|---|---|---|---|---|
| GCC | DHL Express | 1300 | 500 | 1800 | 15000 | 4000 |
| Malaysia | DHL Express | 1600 | 600 | 2200 | 15000 | 4000 |
| USA / Canada | DHL Express | 2200 | 900 | 3100 | 25000 | 5000 |
| Australia | DHL Express | 2200 | 800 | 3000 | 25000 | 5000 |

Also sets the customer duty/VAT note for US, AE, MY, OM, BH, QA, SA, KW, AU, CA (not GB).

## Safety
- Only untouched boxes are filled (zone all-zero / note empty). Re-running never overwrites your edits.
- Zones stay Inactive, master switch stays OFF. Nothing goes live.
- These are estimates, not courier quotes. Replace with real rates before activating a zone, and check one product in the Break-even helper first.
- Export details (IEC, GSTIN, LUT, AD code, HS code) are NOT seeded: they are your legal numbers, fill them from your documents / CA.

## Apply
1. Copy the zip over the repo. 2. Run the SQL file in Supabase > SQL Editor. 3. `git add -A && git commit -m "International: starter shipping rates" && git push`
4. Admin > Settings > International Selling: zones show the new rates (still Inactive).

## Verify (SQL)
select name, base_rate_inr, per_extra_500g_inr, free_shipping_threshold_inr, min_order_inr, courier, is_active from shipping_zones;
select code, vat_note from intl_countries order by sort;
