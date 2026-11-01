# ✅ Deployment Checklist

## Pre-Deployment

- [ ] Extracted ZIP file successfully
- [ ] All 5 files copied to correct locations:
  - [ ] `lib/popularity-rank-server.ts` exists
  - [ ] `app/shop/page.tsx` updated
  - [ ] `app/shop/shop-content.tsx` updated
  - [ ] `app/category/[slug]/page.tsx` updated
  - [ ] `components/category/category-toolbar-grid.tsx` updated

## Build & Local Testing

- [ ] `npm install` (if needed)
- [ ] `npm run build` succeeds with no errors
- [ ] `npm run dev` starts successfully
- [ ] No console errors on startup

## Functionality Testing

- [ ] Visit `/shop` page
  - [ ] Products appear in popularity order immediately
  - [ ] No visual shift after 1-2 seconds
  - [ ] Sort dropdown works correctly
  - [ ] Filters still work

- [ ] Visit `/category/sarees` (or any category)
  - [ ] Products in popularity order on initial load
  - [ ] No shifting or re-rendering
  - [ ] Mobile view looks good

- [ ] Test on different browsers
  - [ ] Chrome
  - [ ] Firefox
  - [ ] Safari
  - [ ] Mobile Safari

## Performance Check

- [ ] Page load time is same or better
- [ ] No unnecessary API calls
- [ ] Browser DevTools shows clean network tab
- [ ] Lighthouse score maintained or improved

## Git Deployment

- [ ] `git status` shows expected changes
- [ ] `git diff` looks correct
- [ ] `git commit -m "feat: show most-viewed products first on initial load"`
- [ ] `git push origin main` succeeds
- [ ] CI/CD pipeline passes (if applicable)

## Post-Deployment

- [ ] Verify changes live on production
- [ ] Monitor error logs for any issues
- [ ] Check if products rank correctly on live site
- [ ] Ask team for feedback

---

**Deployment by:** [Your Name]
**Date:** [Current Date]
**Status:** ☐ Not Started | ☐ In Progress | ☐ Complete

## International payments (Stripe) — Phase 5

New env vars (Netlify > Site settings > Environment variables):
- `STRIPE_SECRET_KEY` — `sk_test_...` while testing, `sk_live_...` for real orders
- `STRIPE_WEBHOOK_SECRET` — `whsec_...` of the endpoint below
- (`NEXT_PUBLIC_SITE_URL` is already used for return URLs)

Run `supabase/migrations/20261103000000_stripe_disputes.sql` in the Supabase SQL editor.

Stripe Dashboard > Developers > Webhooks > Add endpoint:
- URL: `https://sutisaree.com/api/stripe/webhook`
- Events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.expired`,
  `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded`, `charge.dispute.created`

Local test: `stripe listen --forward-to localhost:3000/api/stripe/webhook` (prints a temporary whsec_).
Test cards: `4242 4242 4242 4242` (success), `4000 0025 0000 3155` (3D Secure), `4000 0000 0000 9995` (declined).

---

## International selling (Phases 1-10) - rollout

Everything international sits behind Admin > Settings > International Selling > master switch (default OFF).
Details per phase: `docs/INTERNATIONAL.md`. Security checks: `docs/INTERNATIONAL_PHASE10_VERIFY.sql`.

Migrations to be applied, in order (all additive): `20261102000000_international_orders_foundation`,
`20261103000000_stripe_disputes`, `20261104000000_international_fulfilment`, `20261105000000_international_pnl`.

Env vars: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` (see Stripe section above), optional `NEXT_PUBLIC_SITE_URL`
(used for Stripe return URLs and the `?cc=` canonical header).

Rollout order:
1. Deploy with the master switch OFF. Check the India store, India checkout and the India Merchant feed are unchanged.
2. Fill real courier rates in a zone, enable ONLY US + UAE, Stripe in TEST mode. Run the E2E test in docs/INTERNATIONAL.md.
3. Switch Stripe to LIVE keys + live webhook secret; place one real small order yourself, ship it, refund it.
4. Enable Wave 1 (US, UAE, Malaysia). Watch Admin > International P&L daily for 2 weeks.
5. Enable Wave 2 (OM, BH, QA, SA, KW, AU, CA) only after the P&L shows positive margin. UK only after the VAT decision.
