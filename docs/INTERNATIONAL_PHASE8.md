# International – Phase 8 (Google Merchant Center: multi-country feeds)

## Apply
1. Copy the zip files over the repo (same paths), run `npx tsc --noEmit`.
2. No database migration. No new env var.
3. `git add -A && git commit -m "International orders: Phase 8 merchant feed per country" && git push` (Vercel deploys automatically).

## What changed
- `app/api/merchant-feed/route.ts`
  - `/api/merchant-feed` (India, INR) is unchanged (same XML as before).
  - `/api/merchant-feed?country=US` (also AE, MY, AU, CA, OM, BH, QA, SA, KW, GB) returns a country feed. It answers **404** unless
    International Selling is ON, the country is enabled, it is covered by an ACTIVE shipping zone and its currency has an FX rate.
    It also respects the existing "Enable Google Merchant feed" switch.
  - `<g:price>` / `<g:sale_price>` come from `lib/intl-pricing.ts` (same formula as the storefront and the order RPC; MRP is converted the same way).
  - ONE `<g:shipping>` block for that country: zone base rate converted to the feed currency, zone courier name as service, zone ETA as transit
    days, dispatch window as handling time. If an item's INR price is at/above the zone's free-shipping threshold, that item ships at 0.
  - `?cc=XX` is added to every `<g:link>` (with `&` when `?size=` already exists), so the landing page opens in the same currency.
  - `<g:ships_from_country>IN</g:ships_from_country>` added. Per-colour / per-size items, ids and item_group_id work exactly like India.
  - No `<g:tax>` block (exports under LUT, buyer pays destination duties = DAP). Explained in a code comment.
- Admin > Marketing > Merchant Feed: list of feed URLs per enabled country (copy + open buttons), shown only while International Selling is ON.
- Not done: per-product "export blocked" flag (would need a DB column + product form). Tell me if you want it.

## Merchant Center – click by click (do this per country, start with US and AE)
Golden rule: one country = one feed = one currency. Feed currency, shipping currency and landing-page currency must match.

**A. Programs**
1. merchants.google.com > Growth > Manage programs.
2. Turn on "Free listings" and "Shopping ads". Add the target country (e.g. United States) to each program.
   (Google may ask you to accept the policies for that country.)

**B. Feed (repeat per country)**
1. Products > Feeds > Add feed (or "Add product source").
2. Country of sale: the country (e.g. United States). Language: English. Feed label: the country code (US, AE, MY ...).
3. Input method: Scheduled fetch. File name: anything (e.g. `feed-us.xml`). URL: `https://www.sutisaree.com/api/merchant-feed?country=US`
   (copy the exact URL from Admin > Marketing > Merchant Feed). Fetch daily; create and click "Fetch now" once.
4. Do NOT touch the existing India feed.

**C. Shipping (Settings > Shipping and returns)**
1. Add shipping service for the country. Currency = that country's currency. Handling + transit days = the zone values in Admin > International.
2. Rate: flat rate equal to the zone base rate converted (the feed's `<g:shipping>` already sends the same number; the two must agree).
   If you set a free-shipping threshold in the zone, you can add the same "free over X" rule here.

**D. Returns**
1. Settings > Shipping and returns > Return policies > Add. Country = the country. Window = your international return days (Admin > International).
   Return shipping paid by customer (matches our policy), refund to original payment method.
2. Return policy URL: `https://www.sutisaree.com/returns-exchange/`.

**E. Tax**: leave empty/default. Duties/VAT are paid by the buyer on delivery and the policies say so. Only change it if Google asks for a country.

**F. Check**
1. Open a product link from the feed (it has `?cc=US`): the price must be exactly the feed price, in USD. AE link: AED.
2. Products > Diagnostics, filter by the country: 
   - "Mismatched value (price)" -> landing page price differs from feed. Check FX rates / markup were not edited after the last fetch; fetch again.
   - "Missing shipping" / "Missing return policy" -> do C / D for that country.
   - "Image/Landing page not crawlable" -> the page must load without login (it does).
3. Google Ads: campaign geo-target = the country, feed label = the country code. Start with a small budget for US + UAE.

## TEST CHECKLIST
1. `/api/merchant-feed` opens as before (INR, one shipping block with country IN). `?country=IN` gives the same.
2. International OFF: `/api/merchant-feed?country=US` -> 404. Enable International, enable US but no active zone -> 404.
   Activate a zone with US -> XML with USD prices.
3. Pick one product: feed price (e.g. `56.99 USD`) equals the price on `/product/<slug>?cc=US`. Check one with MRP > price (sale price) and one sized item (`&cc=US` after `?size=`).
4. `<g:shipping>`: country US, price = zone base rate in USD, transit days = zone ETA. A product priced above the free threshold shows `0.00 USD`.
5. `?country=XX` (junk) -> 404. `?country=OM` -> prices with 3 decimals (e.g. `21.750 OMR`).
6. Admin > Marketing > Merchant Feed shows the per-country URLs only while International is ON; countries without a zone are marked.
7. Merchant Center "Fetch now" for the US feed -> items processed, no "price mismatch" in Diagnostics after a few hours.
