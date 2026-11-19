// Checkout shipping methods (India): Free / Standard / Express.
// Every method is managed from Admin > Settings > Shipping Methods:
// price, delivery-time (ETA) text, and an enable/disable switch.
// Defaults match Google Merchant Center ("Free shipping, all orders", transit 3-5 days after
// dispatch, see lib/store-policy.ts): Standard is free for everyone, Express is an optional paid
// upgrade, and the separate "Free" method is off so customers don't see two identical free options.
import { STORE_POLICY } from './store-policy';

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
  free: {
    enabled: false,
    label: 'Free Shipping',
    price: 0,
    eta_min_days: STORE_POLICY.transitMinDays,
    eta_max_days: STORE_POLICY.transitMaxDays,
    min_order: 0,
  },
  standard: {
    enabled: true,
    label: 'Standard Shipping',
    price: 0,
    eta_min_days: STORE_POLICY.transitMinDays,
    eta_max_days: STORE_POLICY.transitMaxDays,
    min_order: 0,
  },
  express: { enabled: true, label: 'Express Shipping', price: 149, eta_min_days: 1, eta_max_days: 2, min_order: 0 },
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

/**
 * Admin-side warnings: settings that would make the site disagree with Google Merchant Center
 * ("Free shipping, all orders", transit 3-5 days after dispatch). Empty array = all good.
 */
export function shippingMethodsMerchantWarnings(methods: ShippingMethodsConfig): string[] {
  const warnings: string[] = [];
  const enabled = SHIPPING_METHOD_IDS.filter((id) => methods[id].enabled);
  if (!enabled.length) return warnings; // legacy flat-rate fallback is already pinned to free
  const freeForAll = enabled.filter((id) => methods[id].min_order === 0 && (id === 'free' || methods[id].price === 0));
  if (!freeForAll.length) {
    warnings.push(
      'No enabled method is free for every order. Merchant Center says "Free shipping, all orders", so keep one method (e.g. Standard) at price 0 and Min order 0.',
    );
  }
  for (const id of freeForAll) {
    const m = methods[id];
    if (m.eta_min_days !== STORE_POLICY.transitMinDays || m.eta_max_days !== STORE_POLICY.transitMaxDays) {
      warnings.push(
        `${m.label}: delivery time is ${m.eta_min_days}-${m.eta_max_days} days, but Merchant Center has ${STORE_POLICY.transitMinDays}-${STORE_POLICY.transitMaxDays} days after dispatch. Use ${STORE_POLICY.transitMinDays} and ${STORE_POLICY.transitMaxDays} to avoid a mismatch.`,
      );
    }
  }
  if (methods.free.enabled && methods.standard.enabled && methods.standard.price === 0 && methods.standard.min_order === 0) {
    warnings.push('Free Shipping and Standard Shipping are both free for everyone, so customers will see two identical options. Disable one.');
  }
  return warnings;
}
