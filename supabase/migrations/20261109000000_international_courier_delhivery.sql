-- International: zone courier name -> Delhivery Cross Border (SAFE TO RE-RUN)
-- Only changes zones still carrying the starter value 'DHL Express' (set by 20261107000000). Your own edits are kept.
UPDATE shipping_zones
SET courier = 'Delhivery Cross Border', updated_at = now()
WHERE courier = 'DHL Express';
