# International – Phase 7 (Policy pages, consent banner, product page)

## Apply
1. Copy the zip files over the repo (same paths), run `npx tsc --noEmit`.
2. No database migration in this phase.
3. Fill the placeholders below (Admin > Settings > Store Info).
4. `git add -A && git commit -m "International orders: Phase 7 policy pages" && git push`

## How the policy pages work
- Your saved text (`settings.legal_pages`) and the India templates are NOT changed or overwritten.
- Each policy has an "International Orders (outside India)" section in `lib/legal-intl.ts`
  (Shipping, Refund, Privacy "International Customers", Terms).
- Live pages (`/legal/[slug]`, also `/shipping-delivery-information`, `/returns-exchange`, etc.), the live-chat widget and the AI chat
  all use the same logic:
  - International Selling OFF -> exactly the old text (any international block is hidden).
  - International Selling ON (and at least one enabled country with an active zone) -> the international section is shown,
    and the old line "We currently ship only within India..." is removed from the Shipping Policy.
  - If you never added the section yourself it is appended automatically at display time.
- Admin > Marketing > Legal Pages: new box "International orders section":
  "Load international template (append)" adds the section to the bottom of that page's editable text (nothing saved until you press Save),
  "Remove international section" takes it out again. You can edit the wording freely inside `[[INTL_START]] ... [[INTL_END]]`.
  If you write your own section titled "International Orders (outside India)" the automatic one is not added.
- Live tokens inside the section: `{{intl_countries}}`, `{{intl_delivery_list}}`, `{{intl_shipping_list}}` (converted to each country's currency
  with the same formula as the storefront), `{{return_days_intl}}`, `{{dispatch_days}}`, `{{company_name}}`, `{{company_address}}`,
  `{{support_email}}`, `{{support_phone}}`.
- Duties text follows Admin > International > default duty mode: DAP text, or DDP text.

## Placeholders / things YOU must fill or confirm
| What | Where |
|---|---|
| Business name, full address, support email, support phone (Stripe + Google need them visible) | Admin > Settings > Store Info (shown on /contact, footer and inside the policies) |
| GSTIN | Store Info (footer). IEC / LUT / AD code stay in Export details (used on the export invoice only) |
| Return window for international orders | Admin > International > "intl return window days" |
| Dispatch time | Admin > Marketing > Shipping & Returns Timing |
| Courier + delivery days + shipping fee per country | Admin > International > Zones |
| Jurisdiction city | Terms section says "North 24 Parganas, West Bengal" (same as your existing Terms) – change inside the section if needed |
| Assumptions I made – please confirm | No P.O. box delivery; stitched/custom items not returnable; for wrong/defective items we refund item + shipping and duties on proof; refund only to original card |

Have your CA/lawyer read the GDPR/CCPA and refund wording once. This is a template, not legal advice.

## Other changes
- `components/cookie-consent.tsx` + a small block in `components/analytics-scripts.tsx`: for visitors whose browser timezone is `Europe/*`
  (or whose selected country is GB) Google tags start with consent DENIED (GA4 Consent Mode v2); a banner offers Accept / Decline and the
  choice is remembered 180 days (cookie `sutisaree_consent`). India and all other visitors: nothing changes, no banner.
- Product page: Details now lists "Country of origin" (from the product's highlights, default India); an "International shipping & duties"
  accordion (links to Shipping Policy + Returns) appears only when the shopper has selected a non-India country.
- Footer already links Shipping, Returns, Privacy, Terms, Contact on every page; /contact already shows address, email, phone from Store Info.
  Canonical slugs (`/shipping-delivery-information`, `/returns-exchange`, `/privacy-policy`, `/terms-and-conditions`) are untouched.

## Optional SQL (read-only check)
```sql
-- Which saved legal pages already contain an international block?
select key,
       (value->>'shipping-policy') like '%[[INTL_START]]%' as shipping_has_block,
       (value->>'refund-policy')   like '%[[INTL_START]]%' as refund_has_block,
       (value->>'privacy-policy')  like '%[[INTL_START]]%' as privacy_has_block,
       (value->>'terms-conditions') like '%[[INTL_START]]%' as terms_has_block
from settings where key = 'legal_pages';
```
To see the saved text without the admin panel: `select value from settings where key = 'legal_pages';`
(If this returns no row, the site is using the built-in templates.) Do not delete the row unless you want to lose your edits.

## TEST CHECKLIST
1. International Selling OFF: open Shipping, Refund, Privacy, Terms pages – text identical to before (still says "ship only within India").
2. Turn ON, enable US + UAE with an active zone: Shipping page shows the International section, countries list, per-country delivery days and
   shipping prices in USD/AED, DAP duty paragraph, and the old "only within India" line is gone. Set duty mode DDP -> paragraph changes.
3. Refund page shows the number of days from the intl return window setting; change the setting -> page updates.
4. Privacy/Terms show the international sections with your email/address/phone filled (no `{{...}}` visible, no `[[...]]` visible).
5. Admin > Marketing > Legal Pages > Shipping: click "Load international template (append)" -> text added at bottom, button now disabled; Save;
   live page shows it once. Click "Remove international section", Save -> live page falls back to the automatic section (ON) or none (OFF).
6. Product page, country = India: no new accordion (only "Country of origin: India" in Details). Switch to US: the "International shipping & duties" accordion appears.
7. Cookie banner: set browser/devtools timezone to Europe/London, reload -> banner shows; Decline -> Network tab shows no analytics hits and
   `sutisaree_consent=denied`; reload -> banner stays hidden. Timezone Asia/Kolkata -> never shown, analytics as before.
8. `/legal/shipping-policy`, `/shipping-delivery-information`, `/returns-exchange` all load.
