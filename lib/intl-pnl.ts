// International profit & loss maths (pure, no I/O; safe on server and client).
// ALL money inside this file is integer PAISE (1 INR = 100 paise) so there are no floating-point money
// bugs. Rounding happens once per line, with Math.round. Values are converted to INR (2 dp) only at the edge
// (see paiseToInr) when sent to the admin UI.
//
// Per order:
//   revenue      = charge_amount (what the customer paid, shipping included) x fx_rate_used   [gross, INR]
//   - stripe_fee = revenue x stripe_fee_percent% + stripe_fixed_fee_inr
//   - fx_loss    = revenue x fx_markup_percent%
//   - cogs       = sum(item cost x qty)           (product_costs; else fallback % of price; else unknown -> flagged)
//   - packaging  = shipping settings "other_charges"
//   - courier    = actual_courier_cost_inr        (fallback: zone estimate, flagged)
//   - duty       = actual_duty_paid_inr           (ONLY when the order was DDP)
//   - refunds    = returns.refund_amount (refunded/completed), capped at revenue
//   - chargeback = lost dispute: remaining revenue + dispute fee
//   - ad spend   = intl_ad_spend_inr (optional)
// If the admin entered actual_settlement_inr (net INR Stripe paid out), "stripe_fee" becomes the real gap
// (revenue - settlement) and fx_loss is 0, because Stripe's payout already contains both.
import {
  THREE_DECIMAL_CURRENCIES,
  previewInrToMinor,
  previewZoneShipping,
  type InternationalCosts,
  type InternationalSettings,
  type ShippingZone,
} from './intl-api';

export interface PnlItem {
  product_id?: string | null;
  quantity?: number | null;
  price?: number | null;
  product_name?: string | null;
}

export interface PnlOrderInput {
  id: string;
  order_number?: string | number | null;
  created_at: string;
  status: string;
  country_code: string | null;
  charge_currency: string | null;
  charge_amount_minor: number | null;
  fx_rate_used: number | null;
  duty_mode: string | null;
  items: PnlItem[] | null;
  actual_courier_cost_inr: number | null;
  actual_duty_paid_inr: number | null;
  actual_settlement_inr: number | null;
  intl_ad_spend_inr: number | null;
  stripe_dispute_id: string | null;
  stripe_dispute_status: string | null;
  /** Sum of refunded/completed returns for this order, INR. */
  refunds_inr: number;
}

export interface PnlContext {
  costs: InternationalCosts;
  settings: InternationalSettings;
  /** product_id -> cost in INR. */
  productCost: Map<string, number>;
  /** shipping settings other_charges, INR per order. */
  packagingInr: number;
  zones: ShippingZone[];
}

export interface PnlRow {
  id: string;
  order_number: string;
  created_at: string;
  status: string;
  country: string;
  currency: string;
  charge_major: number;
  revenue: number;
  fees: number;
  fx_loss: number;
  cogs: number;
  packaging: number;
  courier: number;
  duty: number;
  refunds: number;
  chargeback: number;
  ad_spend: number;
  profit: number;
  margin_percent: number;
  // inputs the admin can still fill in (shown in the UI)
  actual_settlement_inr: number | null;
  intl_ad_spend_inr: number;
  actual_courier_cost_inr: number | null;
  actual_duty_paid_inr: number | null;
  duty_mode: string;
  flags: { cost_missing: boolean; courier_estimated: boolean; settlement_actual: boolean; disputed: boolean };
}

export const paiseToInr = (p: number): number => Math.round(p) / 100;
const toPaise = (inr: number | null | undefined): number => Math.round((Number(inr) || 0) * 100);
const digitsOf = (cur: string) => (THREE_DECIMAL_CURRENCIES.includes(cur.toUpperCase()) ? 3 : 2);

/** Orders that never produced money are not part of the P&L. */
export const PNL_EXCLUDED_STATUSES = ['pending', 'cancelled', 'failed', 'expired'];

export function computeOrderPnl(o: PnlOrderInput, ctx: PnlContext): PnlRow {
  const cur = (o.charge_currency || 'USD').toUpperCase();
  const minor = Number(o.charge_amount_minor) || 0;
  const rate = Number(o.fx_rate_used) || ctx.settings.fx_rates[cur] || 0;
  // gross revenue in paise: minor/10^digits (major units) x rate (INR per unit) x 100, rounded ONCE.
  const revenueP = Math.round((minor * rate * 100) / Math.pow(10, digitsOf(cur)));

  const settlementKnown = o.actual_settlement_inr != null && Number(o.actual_settlement_inr) > 0;
  let feesP: number;
  let fxP: number;
  if (settlementKnown) {
    feesP = revenueP - toPaise(o.actual_settlement_inr); // real combined Stripe fee + conversion loss (can be negative = FX gain)
    fxP = 0;
  } else {
    feesP = Math.round((revenueP * ctx.costs.stripe_fee_percent) / 100) + toPaise(ctx.costs.stripe_fixed_fee_inr);
    fxP = Math.round((revenueP * ctx.settings.fx_markup_percent) / 100);
  }

  // COGS
  const items = Array.isArray(o.items) ? o.items : [];
  let cogsP = 0;
  let costMissing = false;
  for (const it of items) {
    const qty = Math.max(Number(it.quantity) || 0, 0);
    const known = it.product_id ? ctx.productCost.get(String(it.product_id)) : undefined;
    if (known != null) cogsP += toPaise(known) * qty;
    else if (ctx.costs.fallback_cogs_percent > 0) cogsP += Math.round((toPaise(it.price) * qty * ctx.costs.fallback_cogs_percent) / 100);
    else costMissing = true;
  }

  // Courier: actual, else the zone's estimate.
  let courierP = 0;
  let courierEstimated = false;
  if (o.actual_courier_cost_inr != null && Number(o.actual_courier_cost_inr) > 0) {
    courierP = toPaise(o.actual_courier_cost_inr);
  } else {
    courierEstimated = true;
    const zone = ctx.zones.find((z) => o.country_code && z.countries.includes(o.country_code));
    if (zone) {
      const qty = items.reduce((n, i) => n + Math.max(Number(i.quantity) || 0, 0), 0) || 1;
      const itemsInr = items.reduce((n, i) => n + (Number(i.price) || 0) * Math.max(Number(i.quantity) || 0, 0), 0);
      courierP = toPaise(previewZoneShipping(zone, ctx.settings.default_item_weight_grams * qty, itemsInr));
    }
  }

  const dutyP = o.duty_mode === 'DDP' ? toPaise(o.actual_duty_paid_inr) : 0;
  const packagingP = toPaise(ctx.packagingInr);
  const adP = toPaise(o.intl_ad_spend_inr);

  const refundsP = Math.min(toPaise(o.refunds_inr), revenueP);
  const disputed = !!o.stripe_dispute_id;
  const lost = disputed && (o.stripe_dispute_status || '').toLowerCase() !== 'won';
  const chargebackP = lost ? revenueP - refundsP + toPaise(ctx.costs.dispute_fee_inr) : 0;

  const profitP = revenueP - feesP - fxP - cogsP - packagingP - courierP - dutyP - refundsP - chargebackP - adP;
  const margin = revenueP > 0 ? Math.round((profitP / revenueP) * 1000) / 10 : 0;

  return {
    id: o.id,
    order_number: o.order_number != null ? String(o.order_number) : o.id.slice(0, 8).toUpperCase(),
    created_at: o.created_at,
    status: o.status,
    country: o.country_code || '',
    currency: cur,
    charge_major: minor / Math.pow(10, digitsOf(cur)),
    revenue: paiseToInr(revenueP),
    fees: paiseToInr(feesP),
    fx_loss: paiseToInr(fxP),
    cogs: paiseToInr(cogsP),
    packaging: paiseToInr(packagingP),
    courier: paiseToInr(courierP),
    duty: paiseToInr(dutyP),
    refunds: paiseToInr(refundsP),
    chargeback: paiseToInr(chargebackP),
    ad_spend: paiseToInr(adP),
    profit: paiseToInr(profitP),
    margin_percent: margin,
    actual_settlement_inr: o.actual_settlement_inr ?? null,
    intl_ad_spend_inr: Number(o.intl_ad_spend_inr) || 0,
    actual_courier_cost_inr: o.actual_courier_cost_inr ?? null,
    actual_duty_paid_inr: o.actual_duty_paid_inr ?? null,
    duty_mode: o.duty_mode || 'DAP',
    flags: { cost_missing: costMissing, courier_estimated: courierEstimated, settlement_actual: settlementKnown, disputed },
  };
}

export interface PnlTotals {
  orders: number;
  revenue: number;
  fees: number;
  fx_loss: number;
  cogs: number;
  packaging: number;
  courier: number;
  duty: number;
  refunds: number;
  chargeback: number;
  ad_spend: number;
  profit: number;
  margin_percent: number;
  /** % of orders that were (partly) refunded or lost/open disputes. */
  return_chargeback_rate: number;
  loss_orders: number;
  cost_missing_orders: number;
}

const FIELDS = ['revenue', 'fees', 'fx_loss', 'cogs', 'packaging', 'courier', 'duty', 'refunds', 'chargeback', 'ad_spend', 'profit'] as const;

export function sumRows(rows: PnlRow[]): PnlTotals {
  const t = { orders: rows.length } as PnlTotals;
  for (const f of FIELDS) {
    // sum in paise to stay exact, convert once at the end
    t[f] = paiseToInr(rows.reduce((n, r) => n + Math.round(r[f] * 100), 0));
  }
  t.margin_percent = t.revenue > 0 ? Math.round((t.profit / t.revenue) * 1000) / 10 : 0;
  const bad = rows.filter((r) => r.refunds > 0 || r.chargeback > 0 || r.flags.disputed).length;
  t.return_chargeback_rate = rows.length ? Math.round((bad / rows.length) * 1000) / 10 : 0;
  t.loss_orders = rows.filter((r) => r.profit < 0).length;
  t.cost_missing_orders = rows.filter((r) => r.flags.cost_missing).length;
  return t;
}

export function groupByCountry(rows: PnlRow[]): Array<{ country: string; totals: PnlTotals }> {
  const m = new Map<string, PnlRow[]>();
  for (const r of rows) m.set(r.country || '??', [...(m.get(r.country || '??') || []), r]);
  return Array.from(m, ([country, rs]) => ({ country, totals: sumRows(rs) })).sort((a, b) => b.totals.revenue - a.totals.revenue);
}

// ---------------- Break-even helper ----------------
export interface BreakEvenInput {
  zone: ShippingZone;
  currency: string;
  /** Selling price of the item(s), INR, before shipping. */
  priceInr: number;
  /** Your cost for those item(s), INR. */
  costInr: number;
  /** What the courier will bill you for the parcel, INR. */
  courierCostInr: number;
  packagingInr: number;
  /** Extra duty you absorb (DDP only), INR. */
  dutyInr: number;
  weightGrams: number;
  settings: InternationalSettings;
  costs: InternationalCosts;
}

export interface BreakEvenResult {
  shippingChargedInr: number;
  customerPaysMinor: number;
  revenueInr: number;
  feesInr: number;
  fxLossInr: number;
  profitInr: number;
  marginPercent: number;
  /** Smallest items value (INR) at which profit >= 0 keeping the same cost-to-price ratio; null = never profitable. */
  minOrderInr: number | null;
  zoneMinOrderInr: number;
  zoneBelowBreakEven: boolean;
}

export function computeBreakEven(i: BreakEvenInput): BreakEvenResult {
  const rate = i.settings.fx_rates[i.currency] || 0;
  const markup = 1 + Math.max(i.settings.intl_price_markup_percent || 0, 0) / 100;
  const ship = previewZoneShipping(i.zone, i.weightGrams, i.priceInr);
  const minor = previewInrToMinor((i.priceInr + ship) * markup, i.currency, i.settings);
  const revenueP = Math.round((minor * rate * 100) / Math.pow(10, digitsOf(i.currency)));
  const feesP = Math.round((revenueP * i.costs.stripe_fee_percent) / 100) + toPaise(i.costs.stripe_fixed_fee_inr);
  const fxP = Math.round((revenueP * i.settings.fx_markup_percent) / 100);
  const profitP = revenueP - feesP - fxP - toPaise(i.costInr) - toPaise(i.packagingInr) - toPaise(i.courierCostInr) - toPaise(i.dutyInr);

  // Break-even order value V (items value, INR): profit(V) = (V*m + ship) * k - fixed - ratio*V - packaging - courier - duty = 0
  // k = share of revenue left after Stripe % and FX; ratio = cost/price. Assumes shipping stays at the zone fee.
  const k = 1 - (i.costs.stripe_fee_percent + i.settings.fx_markup_percent) / 100;
  const ratio = i.priceInr > 0 ? i.costInr / i.priceInr : 0;
  const fixed = i.costs.stripe_fixed_fee_inr + i.packagingInr + i.courierCostInr + i.dutyInr;
  const slope = markup * k - ratio;
  let minOrder: number | null = null;
  if (slope > 0) {
    const v = (fixed - ship * markup * k) / slope;
    minOrder = Math.max(Math.ceil(v), 0);
  }
  return {
    shippingChargedInr: ship,
    customerPaysMinor: minor,
    revenueInr: paiseToInr(revenueP),
    feesInr: paiseToInr(feesP),
    fxLossInr: paiseToInr(fxP),
    profitInr: paiseToInr(profitP),
    marginPercent: revenueP > 0 ? Math.round((profitP / revenueP) * 1000) / 10 : 0,
    minOrderInr: minOrder,
    zoneMinOrderInr: i.zone.min_order_inr,
    zoneBelowBreakEven: minOrder != null && i.zone.min_order_inr < minOrder,
  };
}
