// Shared (client + server) config for the Analytics > Dashboards tab.
// Stored in the existing `settings` table under key `analytics_dashboards`
// -- no new table / migration needed.

export type DashboardId = 'kpi' | 'store' | 'marketing' | 'live';

export const DASHBOARD_META: Record<DashboardId, { title: string; description: string }> = {
  kpi: {
    title: 'Ecommerce KPI',
    description: 'Aaj ki sales, orders, mahine ka comparison, state-wise sales, payment & traffic source.',
  },
  store: {
    title: 'Store Overview',
    description: 'Is hafte ki sales, AOV, best sellers, pending orders, cancellations, top coupon.',
  },
  marketing: {
    title: 'Marketing',
    description: 'Funnel, cart abandonment, orders by medium, website visits, subscribers, latest reviews.',
  },
  live: {
    title: 'Live Sale Monitor',
    description: 'Festival / sale day ke liye: sales target, hourly orders, live visitors, support queue.',
  },
};

export const DASHBOARD_IDS = Object.keys(DASHBOARD_META) as DashboardId[];

export interface DashboardSettings {
  enabled: Record<DashboardId, boolean>;
  /** 0 = manual refresh only (safest for free-tier quota). */
  refreshSeconds: 0 | 60 | 120 | 300;
  /** Daily sales target (INR) for the Live Sale Monitor progress bar. */
  dailySalesTarget: number;
}

export const DEFAULT_DASHBOARD_SETTINGS: DashboardSettings = {
  enabled: { kpi: true, store: true, marketing: false, live: false },
  refreshSeconds: 0,
  dailySalesTarget: 50000,
};

export function mergeDashboardSettings(raw: any): DashboardSettings {
  const d = DEFAULT_DASHBOARD_SETTINGS;
  const enabled = { ...d.enabled };
  for (const id of DASHBOARD_IDS) {
    if (typeof raw?.enabled?.[id] === 'boolean') enabled[id] = raw.enabled[id];
  }
  const r = Number(raw?.refreshSeconds);
  const refreshSeconds = ([0, 60, 120, 300] as const).includes(r as any) ? (r as DashboardSettings['refreshSeconds']) : d.refreshSeconds;
  const t = Number(raw?.dailySalesTarget);
  const dailySalesTarget = Number.isFinite(t) && t > 0 ? Math.min(Math.round(t), 100_000_000) : d.dailySalesTarget;
  return { enabled, refreshSeconds, dailySalesTarget };
}

// ── API payload types ──────────────────────────────────────────────────────
export interface Delta { value: number; prev: number; }
export interface NameValue { name: string; value: number; }

export interface KpiData {
  todaySales: Delta; // vs same weekday last week
  todayOrders: Delta;
  monthSales: Delta; // this month so far vs full last month so far (same day count)
  aov: Delta; // this month vs last month
  salesByDay: { day: number; thisMonth: number | null; lastMonth: number }[];
  ordersByDay: { day: number; thisMonth: number | null; lastMonth: number }[];
  byPayment: NameValue[];
  byState: NameValue[]; // sales INR
  bySource: NameValue[]; // sales INR
  costs: { shipping: number; discounts: number; gst: number };
}

export interface StoreData {
  salesToday: Delta; // vs yesterday
  weekTrend: { label: string; value: number }[];
  aovWeek: number;
  aovPrevWeek: number;
  bestSellers: NameValue[];
  unfulfilled: { id: string; short: string; status: string; amount: number; payment: string; coupon: string | null }[];
  unfulfilledTotal: number;
  cancellations: Delta;
  cancelReasons: NameValue[];
  topCoupon: { code: string; total: number; trend: { label: string; value: number }[] } | null;
}

export interface MarketingData {
  funnel: NameValue[];
  cartAbandonment: number; // percent
  abandonedValue: number;
  abandonedCount: number;
  visitsTrend: { label: string; value: number }[];
  byMedium: NameValue[];
  subscribers: { total: number; thisWeek: number };
  reviews: { name: string; rating: number; text: string; at: string }[];
  aovWeek: number;
}

export interface LiveData {
  salesToday: number;
  target: number;
  ordersToday: number;
  hourly: { hour: number; value: number }[];
  visitorsNow: number;
  openTickets: number;
  newMessages: number;
  pendingOrders: number;
  byCoupon: NameValue[];
  topPages: NameValue[];
}

export interface DashboardsResponse {
  settings: DashboardSettings;
  generatedAt: string;
  data: {
    kpi?: KpiData;
    store?: StoreData;
    marketing?: MarketingData;
    live?: LiveData;
  };
  errors?: Partial<Record<DashboardId, string>>;
}
