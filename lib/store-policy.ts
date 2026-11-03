// ---------------------------------------------------------------------
// STORE POLICY — single source of truth for shipping & returns.
//
// These values MUST mirror Google Merchant Center exactly:
//   Merchant Center > Shipping and returns > Shipping policies ("Free Shipping")
//     - Country:            India, all products
//     - Order cut off:      12:00 AM, India Standard Time (GMT+05:30)
//     - Handling time:      1-2 days (Mon-Sun)
//     - Transit time:       3-5 days, all destinations (Mon-Sun)
//     - Total delivery:     4-7 business days
//     - Shipping cost:      Free shipping, all orders (INR)
//   Merchant Center > Shipping and returns > Return policies ("Standard for India")
//     - Return window:      5 days
//     - Return cost:        Free
//
// Every storefront surface (product page, cart, checkout, legal pages,
// footer/header, JSON-LD, merchant feed) reads from here, so if Merchant
// Center is ever changed, change it HERE ONCE and the site stays in sync.
// This file has no imports so it is safe in client AND server code.
// ---------------------------------------------------------------------

export const STORE_POLICY = {
  country: 'IN',
  currency: 'INR',

  orderCutoffLabel: '12:00 AM',
  orderCutoffTimezone: 'India Standard Time (GMT+05:30)',

  handlingMinDays: 1,
  handlingMaxDays: 2,
  transitMinDays: 3,
  transitMaxDays: 5,
  totalMinDays: 4,
  totalMaxDays: 7,

  // Free shipping on ALL orders (flat fee 0, no minimum order value).
  flatShippingRate: 0,
  freeShippingThreshold: 0,

  returnWindowDays: 5,
  returnCost: 'Free' as const,
  returnPolicyName: 'Standard for India',
} as const;

export const TOTAL_DELIVERY_LABEL = `${STORE_POLICY.totalMinDays}–${STORE_POLICY.totalMaxDays} business days`;
export const HANDLING_LABEL = `${STORE_POLICY.handlingMinDays}–${STORE_POLICY.handlingMaxDays} business days`;
export const TRANSIT_LABEL = `${STORE_POLICY.transitMinDays}–${STORE_POLICY.transitMaxDays} business days`;
export const RETURN_WINDOW_LABEL = `${STORE_POLICY.returnWindowDays} days`;
