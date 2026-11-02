# International - Phase 18 (Delhivery as the international courier)

## What changed
- `lib/intl-shipping.ts`, `components/admin/intl-shipment-modal.tsx`: "Delhivery" added to the international courier list and selected by default. The tracking link is pasted by you (copy it from the Delhivery Cross Border dashboard), because Delhivery cross-border parcels can be handed to a partner carrier for the last mile and I did not verify a fixed public link format.
- Migration `20261109000000_international_courier_delhivery.sql`: zones that still say "DHL Express" now say "Delhivery Cross Border".
- Not changed: international orders are NOT tracked by the Delhivery domestic API (Phase 14), delivered is set by hand.

## How a shipment works
1. Book the parcel in Delhivery's Cross Border dashboard (needs: Cross Border activated on Services page, international pickup location, seller KYC, international wallet recharge).
2. Admin > Orders > international order > Delhivery, paste AWB + tracking link + courier cost, Save. Customer gets the email.

## Apply
Copy zip, run the SQL in Supabase, then `git add -A && git commit -m "International: Delhivery courier" && git push`.
