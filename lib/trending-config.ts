// Shared (browser + server): "Trending Now" ranking me kaun se signals gine jayen
// aur kis date ke BAAD ka data dekha jaye. Admin > Analytics > settings se set hota hai.
// Default: chaaron signals ON, date khali = pichle 30 din (pehle jaisa hi behaviour).

export const TRENDING_CONFIG_KEY = 'trending_config';
export const TRENDING_DEFAULT_DAYS = 30;

export type TrendingSignal = 'purchase' | 'checkout' | 'cart' | 'view';

export const TRENDING_SIGNALS: TrendingSignal[] = ['purchase', 'checkout', 'cart', 'view'];

export type TrendingConfig = {
  purchase: boolean;
  checkout: boolean;
  cart: boolean;
  view: boolean;
  /** 'YYYY-MM-DD' -- is date ke baad ka data ginna. null = pichle 30 din. */
  since: string | null;
};

export const DEFAULT_TRENDING_CONFIG: TrendingConfig = {
  purchase: true,
  checkout: true,
  cart: true,
  view: true,
  since: null,
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function normalizeTrendingConfig(raw: unknown): TrendingConfig {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const since = typeof o.since === 'string' && DATE_RE.test(o.since) && !Number.isNaN(Date.parse(o.since)) ? o.since : null;
  return {
    purchase: o.purchase !== false,
    checkout: o.checkout !== false,
    cart: o.cart !== false,
    view: o.view !== false,
    since,
  };
}

/** Chosen date ki shuruaat India time (IST, +05:30) se. Date nahi to pichle 30 din. */
export function trendingSinceISO(cfg: TrendingConfig): string {
  if (cfg.since) return new Date(`${cfg.since}T00:00:00+05:30`).toISOString();
  return new Date(Date.now() - TRENDING_DEFAULT_DAYS * 86400_000).toISOString();
}
