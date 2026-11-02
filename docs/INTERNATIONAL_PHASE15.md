# International - Phase 15 (export invoice: names with accents print correctly)

## Problem
The export invoice uses the built-in Helvetica font. Any character it cannot encode was printed as `?`, so names like "Fatima" written as "Fātima", "Şeyma", "Łukasz" or curly quotes in an address came out as `F?tima`.

## What changed
- `lib/export-invoice-pdf.ts`: new exported `makeSafeText()`. For each character: keep it if the font has it; otherwise use the plain-Latin form (accent removed, l-stroke, dotless i, curly quotes -> straight); otherwise `?`. Applied through the same `makeSafe` that every text on the invoice already goes through, so no layout change.
- `scripts/test-export-invoice-text.ts`: 11 checks.
- Audit result: customer order messages are email only (no customer WhatsApp for orders), so nothing to change there.

## Apply
1. Copy the zip over the repo (no DB migration, no env var).
2. `npx tsx scripts/test-export-invoice-text.ts` -> ALL PASS.
3. `git add -A && git commit -m "International orders: export invoice accent-safe text" && git push`

## Test checklist
1. Place a Stripe TEST order with name "Fātima Şahin" and address line with an apostrophe (’). Download the export invoice: name prints as "Fatima Sahin", no `?`.
2. Name "José Müller" prints unchanged.
3. India invoice (lib/invoice-pdf.ts) untouched.

## Known limit (not fixed)
Arabic, Chinese, Hindi etc. letters still print as `?`. Fixing that needs an embedded Unicode font AND text shaping (Arabic letters join and run right-to-left), which pdf-lib does not do. Customers normally enter Latin names at checkout; if you see Arabic names often, tell me and I will add a "name in Latin letters" hint at international checkout instead.
