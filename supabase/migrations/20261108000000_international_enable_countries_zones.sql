-- International: switch ON the countries and zones (the master switch stays OFF) (SAFE TO RE-RUN)
--
-- * Enables US, AE, MY, OM, BH, QA, SA, KW, AU, CA.
-- * UK (GB) stays OFF on purpose: selling to the UK up to GBP 135 needs UK VAT registration (your decision).
-- * Activates a shipping zone ONLY if it has a real rate (base_rate_inr > 0).
-- * Does NOT touch international_enabled. Nothing is visible to customers until you run docs/INTERNATIONAL_GO_LIVE.sql.
UPDATE intl_countries
SET is_enabled = true
WHERE code IN ('US','AE','MY','OM','BH','QA','SA','KW','AU','CA');

UPDATE shipping_zones
SET is_active = true, updated_at = now()
WHERE base_rate_inr > 0;
