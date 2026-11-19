// Checkout shipping methods (India): Free / Standard / Express.
// Every method is managed from Admin > Settings > Shipping Methods:
// price, delivery-time (ETA) text, and an enable/disable switch.
// Defaults keep today's behaviour: only "Free Shipping" is on, so nothing
// changes at checkout until the admin switches Standard/Express on.

export type ShippingMethodId = 'free' | 'standard' | 'express';

export interface ShippingMethodConfig {
  enabled: boolean;
  /** Name shown to the customer, e.g. "Express Shipping" */
  label: string;
  /** Charge in rupees. Ignored for "free" (always 0). */
  price: number;
  /** Delivery estimate (business days after dispatch). */
  eta_min_days: number;
  eta_max_days: number;
  /** Cart subtotal (₹) needed to unlock this method. 0 = always available. */
  min_order: number;
}

export type ShippingMethodsConfig = Record<ShippingMethodId, ShippingMethodConfig>;

export const SHIPPING_METHOD_IDS: ShippingMethodId[] = ['free', 'standard', 'express'];

export const DEFAULT_SHIPPING_METHODS: ShippingMethodsConfig = {
  free: { enabled: true, label: 'Free Shipping', price: 0, eta_min_days: 5, eta_max_days: 7, min_order: 0 },
  standard: { enabled: false, label: 'Standard Shipping', price: 79, eta_min_days: 4, eta_max_days: 6, min_order: 0 },
  express: { enabled: false, label: 'Express Shipping', price: 149, eta_min_days: 2, eta_max_days: 3, min_order: 0 },
};

/** Merge whatever is saved in the DB over the defaults (safe for old/partial data). */
export function normalizeShippingMethods(raw: unknown): ShippingMethodsConfig {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<ShippingMethodId, Partial<ShippingMethodConfig>>>;
  const out = {} as ShippingMethodsConfig;
  for (const id of SHIPPING_METHOD_IDS) {
    const d = DEFAULT_SHIPPING_METHODS[id];
    const s = src[id] ?? {};
    const num = (v: unknown, fb: number) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fb);
    out[id] = {
      enabled: typeof s.enabled === 'boolean' ? s.enabled : d.enabled,
      label: typeof s.label === 'string' && s.label.trim() ? s.label.trim() : d.label,
      price: id === 'free' ? 0 : num(s.price, d.price),
      eta_min_days: num(s.eta_min_days, d.eta_min_days),
      eta_max_days: Math.max(num(s.eta_max_days, d.eta_max_days), num(s.eta_min_days, d.eta_min_days)),
      min_order: num(s.min_order, d.min_order),
    };
  }
  return out;
}

export function formatMethodEta(m: Pick<ShippingMethodConfig, 'eta_min_days' | 'eta_max_days'>): string {
  if (!m.eta_max_days) return '';
  return m.eta_min_days === m.eta_max_days
    ? `${m.eta_max_days} business days`
    : `${m.eta_min_days}-${m.eta_max_days} business days`;
}

export interface AvailableShippingMethod extends ShippingMethodConfig {
  id: ShippingMethodId;
}

/** Methods the customer can pick for this cart subtotal (enabled + minimum order met). */
export function getAvailableShippingMethods(
  methods: ShippingMethodsConfig,
  subtotal: number,
): AvailableShippingMethod[] {
  return SHIPPING_METHOD_IDS.filter((id) => methods[id].enabled && subtotal >= methods[id].min_order).map(
    (id) => ({ id, ...methods[id], price: id === 'free' ? 0 : methods[id].price }),
  );
}

/** Plain-text lines for the Shipping Policy page ({{shipping_methods}} token). */
export function shippingMethodsPolicyText(methods: ShippingMethodsConfig): string {
  const lines: string[] = [];
  for (const id of SHIPPING_METHOD_IDS) {
    const m = methods[id];
    if (!m.enabled) continue;
    const price = id === 'free' || m.price === 0 ? 'Free' : `Rs ${m.price.toLocaleString('en-IN')}`;
    const eta = formatMethodEta(m);
    const cond = m.min_order > 0 ? ` (on orders of Rs ${m.min_order.toLocaleString('en-IN')} or more)` : '';
    lines.push(`${m.label}: ${price}${cond}${eta ? ` - delivery in ${eta} after dispatch` : ''}`);
  }
  return lines.length ? lines.join('\n') : 'We currently offer free shipping on all orders, with no minimum order value.';
}
