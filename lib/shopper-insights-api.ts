export interface NV { name: string; value: number }

export interface LocationRow {
  name: string;
  visitors: number; // jinhone koi product dekha / cart / checkout kiya
  carted: number; // add to cart karne wale log
  checkout: number; // begin checkout karne wale log
  purchased: number; // order karne wale log
  atcEvents: number; // total add-to-cart clicks
  revenue: number; // order value (INR) of these visitors
}

export interface ProductRow {
  productId: string;
  name: string;
  slug: string | null;
  image: string | null;
  orders: number; // real orders (cancelled excluded)
  units: number;
  revenue: number;
  views: number; // unique sessions
  atcEvents: number;
  atcQty: number;
  atcVisitors: number;
  checkoutVisitors: number;
  colors: NV[];
}

export interface VisitorRow {
  id: string; // short anonymous id
  label: string; // email if known, else "Guest #xxxx"
  visits: number; // alag-alag sessions
  days: number; // alag-alag din
  atcEvents: number;
  checkoutStarted: boolean;
  purchased: boolean;
  cartValue: number;
  revenue: number;
  city: string;
  state: string;
  country: string;
  device: string;
  source: string;
  firstSeen: string;
  lastSeen: string;
  products: string[];
}

export interface PeriodTotals {
  atcEvents: number;
  atcVisitors: number;
  checkoutVisitors: number;
  purchaseVisitors: number;
  revenue: number;
}

export interface AbandonedCartRow {
  id: string;
  email: string | null;
  phone: string | null;
  cartValue: number;
  items: string[];
  lastActivity: string;
  waUrl: string | null;
}

export interface PincodeRow { pincode: string; place: string; orders: number; revenue: number; problems: number }

export interface FeaturedRow {
  placement: string;
  label: string;
  clicks: number; // strip se khule product ke views
  cartSessions: number;
  checkoutSessions: number;
  orders: number;
  revenue: number;
}

export interface ShopperInsights {
  featured: FeaturedRow[];
  prev: PeriodTotals | null;
  cartBands: { name: string; checkouts: number; purchased: number }[];
  pincodes: PincodeRow[];
  abandonedCarts: AbandonedCartRow[];
  range: { from: string; to: string };
  generatedAt: string;
  truncated: boolean;
  needsMigration: boolean;
  hasGeoData: boolean;
  totals: {
    atcEvents: number;
    atcQty: number;
    atcVisitors: number;
    checkoutVisitors: number;
    purchaseVisitors: number;
    orders: number;
    revenue: number;
    abandonedVisitors: number;
    abandonedValue: number;
    productViewVisitors: number;
  };
  funnel: NV[];
  products: ProductRow[];
  locations: { state: LocationRow[]; city: LocationRow[]; country: LocationRow[] };
  repeat: {
    newVisitors: number;
    repeatVisitors: number;
    repeatRate: number; // percent
    repeatNotBought: number;
    avgVisitsOfCarters: number;
  };
  visitors: VisitorRow[];
  hourly: { hour: number; atc: number; checkout: number }[];
  daily: { day: string; atc: number; checkout: number; purchase: number }[];
  devices: LocationRow[];
  sources: LocationRow[];
}

export async function fetchShopperInsights(from: Date, to: Date): Promise<ShopperInsights> {
  const qs = new URLSearchParams({ from: from.toISOString(), to: to.toISOString() });
  const res = await fetch(`/api/admin/shopper-insights?${qs.toString()}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to load shopper insights');
  }
  return res.json();
}
