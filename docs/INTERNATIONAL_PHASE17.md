# International - Phase 17 (countries + zones enabled, go-live in one SQL)

1. Run `supabase/migrations/20261108000000_international_enable_countries_zones.sql` in Supabase: enables 10 countries (not UK) and activates the 4 zones that have rates. Master switch stays OFF, customers see nothing yet. Admin shows everything enabled.
2. When Stripe test keys are in Netlify and you want to test: run `docs/INTERNATIONAL_GO_LIVE.sql` (it checks that a country + active zone exist). To switch off, use the commented line at its bottom.
3. Not done for you: Stripe keys/webhook (your Stripe + Netlify accounts), IEC/GSTIN/LUT/AD/HS code (legal numbers from your documents/CA), real courier rates.
