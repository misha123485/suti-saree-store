// Run: npx tsx scripts/test-intl-pnl.ts   (no database needed; checks the Phase 9 P&L maths)
import assert from 'node:assert/strict';
import { computeOrderPnl, computeBreakEven, sumRows, type PnlContext, type PnlOrderInput } from '../lib/intl-pnl';
import { DEFAULT_INTERNATIONAL_SETTINGS, DEFAULT_INTERNATIONAL_COSTS, type ShippingZone } from '../lib/intl-api';

const zone: ShippingZone = { id: 'z', name: 'USA', countries: ['US'], base_rate_inr: 1800, per_extra_500g_inr: 600, free_shipping_threshold_inr: 0, min_order_inr: 2000, eta_min_days: 7, eta_max_days: 12, courier: 'DHL', is_active: true };
const ctx = (cost: number): PnlContext => ({
  costs: { ...DEFAULT_INTERNATIONAL_COSTS, stripe_fee_percent: 3 },
  settings: { ...DEFAULT_INTERNATIONAL_SETTINGS, fx_markup_percent: 2 },
  productCost: new Map([['p1', cost]]),
  packagingInr: 50,
  zones: [zone],
});
const base: PnlOrderInput = {
  id: 'abcdef12-0000', created_at: '2026-11-02T00:00:00Z', status: 'paid', country_code: 'US', charge_currency: 'USD',
  charge_amount_minor: 7999, fx_rate_used: 90, duty_mode: 'DAP', items: [{ product_id: 'p1', quantity: 1, price: 6500 }],
  actual_courier_cost_inr: 1800, actual_duty_paid_inr: null, actual_settlement_inr: null, intl_ad_spend_inr: 0,
  stripe_dispute_id: null, stripe_dispute_status: null, refunds_inr: 0,
};

// 1) PROFITABLE: $79.99 @ 90 = 7199.10; fee 215.97; fx 143.98; cost 2500; pack 50; courier 1800 => 2489.15 (34.6%)
const a = computeOrderPnl(base, ctx(2500));
assert.equal(a.revenue, 7199.1); assert.equal(a.fees, 215.97); assert.equal(a.fx_loss, 143.98);
assert.equal(a.profit, 2489.15); assert.equal(a.margin_percent, 34.6);

// 2) LOSS-MAKING: $39.99 @ 90 = 3599.10; fee 107.97; fx 71.98; cost 2000; pack 50; courier 2200 => -830.85 (-23.1%)
const b = computeOrderPnl({ ...base, charge_amount_minor: 3999, actual_courier_cost_inr: 2200 }, ctx(2000));
assert.equal(b.profit, -830.85); assert.equal(b.margin_percent, -23.1);

// 3) Actual settlement replaces estimated Stripe fee + FX (7199.10 - 6900 = 299.10 combined, fx 0)
const c = computeOrderPnl({ ...base, actual_settlement_inr: 6900 }, ctx(2500));
assert.equal(c.fees, 299.1); assert.equal(c.fx_loss, 0); assert.equal(c.flags.settlement_actual, true);

// 4) Lost chargeback: whole revenue + dispute fee lost
const d = computeOrderPnl({ ...base, stripe_dispute_id: 'dp_1', stripe_dispute_status: 'lost' }, ctx(2500));
assert.equal(d.chargeback, 7199.1 + 1350);

// 5) Missing cost is flagged, DAP duty ignored, DDP duty counted
const e = computeOrderPnl({ ...base, actual_duty_paid_inr: 900 }, { ...ctx(0), productCost: new Map() });
assert.equal(e.flags.cost_missing, true); assert.equal(e.duty, 0);
assert.equal(computeOrderPnl({ ...base, duty_mode: 'DDP', actual_duty_paid_inr: 900 }, ctx(2500)).duty, 900);

// 6) Totals are exact sums
const t = sumRows([a, b]);
assert.equal(t.revenue, 10798.2); assert.equal(t.profit, 1658.3); assert.equal(t.loss_orders, 1);

// 7) Break-even: zone min order below break-even is flagged
const be = computeBreakEven({ zone, currency: 'USD', priceInr: 3000, costInr: 1800, courierCostInr: 4000, packagingInr: 50, dutyInr: 0, weightGrams: 700, settings: DEFAULT_INTERNATIONAL_SETTINGS, costs: DEFAULT_INTERNATIONAL_COSTS });
assert.ok(be.minOrderInr !== null && be.minOrderInr > 0);
assert.equal(be.zoneBelowBreakEven, true); // zone min 2000 < break-even
// shipping fee already covers the courier => every order breaks even (minOrder 0, not flagged)
const be0 = computeBreakEven({ zone, currency: 'USD', priceInr: 3000, costInr: 1800, courierCostInr: 1800, packagingInr: 50, dutyInr: 0, weightGrams: 700, settings: DEFAULT_INTERNATIONAL_SETTINGS, costs: DEFAULT_INTERNATIONAL_COSTS });
assert.equal(be0.minOrderInr, 0); assert.equal(be0.zoneBelowBreakEven, false);
console.log('All P&L checks passed. break-even min order ₹', be.minOrderInr, '| zone min ₹', zone.min_order_inr, '| flagged:', be.zoneBelowBreakEven);
