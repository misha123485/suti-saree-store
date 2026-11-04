// ---------------------------------------------------------------------
// "App Layout" (Admin > Marketing > App Layout) — controls the app-style
// top of the homepage: the scrollable primary-category tab bar and the
// 2/3-row "all categories" grid below it.
//
// One JSON row in the generic `settings` table (key: home_app_layout),
// same pattern as discover_section_settings — NO migration needed.
// This file is client/server safe (no server-only imports); the server
// read lives in lib/home-data-server.ts.
// ---------------------------------------------------------------------

export type AppTileShape = 'rounded' | 'circle';

export interface HomeAppLayoutSettings {
  /** Master switch — off = the old "Shop by Category" circles are shown. */
  enabled: boolean;
  /** Show the first "For You" (home) tab in the top bar. */
  show_for_you_tab: boolean;
  for_you_label: string;
  /** Category ids shown (in this order) in the top scrollable bar.
   *  Empty = auto: first 8 categories that have products. */
  primary_category_ids: string[];
  /** Show the 2/3-row grid with every category below the banner. */
  show_grid: boolean;
  grid_title: string;
  /** How many rows the (horizontally scrollable) grid uses. */
  grid_rows: 2 | 3;
  tile_shape: AppTileShape;
  /** Tile background colour (hex). */
  tile_bg: string;
  /** Top bar background colour (hex), '' = theme default. */
  bar_bg: string;
  /** Category ids hidden from the grid. */
  hidden_category_ids: string[];
}

export const DEFAULT_HOME_APP_LAYOUT: HomeAppLayoutSettings = {
  enabled: true,
  show_for_you_tab: true,
  for_you_label: 'For You',
  primary_category_ids: [],
  show_grid: true,
  grid_title: 'Shop by Category',
  grid_rows: 2,
  tile_shape: 'rounded',
  tile_bg: '#FCE8DF',
  bar_bg: '',
  hidden_category_ids: [],
};

export const HOME_APP_LAYOUT_KEY = 'home_app_layout';

const HEX = /^#[0-9a-fA-F]{6}$/;

/** Merge whatever is stored with defaults and sanitise every field. */
export function normalizeHomeAppLayout(raw: unknown): HomeAppLayoutSettings {
  const d = DEFAULT_HOME_APP_LAYOUT;
  if (!raw || typeof raw !== 'object') return d;
  const v = raw as Partial<HomeAppLayoutSettings>;
  const ids = (a: unknown) =>
    Array.isArray(a) ? a.filter((x): x is string => typeof x === 'string') : [];
  return {
    enabled: v.enabled ?? d.enabled,
    show_for_you_tab: v.show_for_you_tab ?? d.show_for_you_tab,
    for_you_label: (v.for_you_label || d.for_you_label).slice(0, 20),
    primary_category_ids: ids(v.primary_category_ids),
    show_grid: v.show_grid ?? d.show_grid,
    grid_title: (v.grid_title ?? d.grid_title).slice(0, 60),
    grid_rows: v.grid_rows === 3 ? 3 : 2,
    tile_shape: v.tile_shape === 'circle' ? 'circle' : 'rounded',
    tile_bg: v.tile_bg && HEX.test(v.tile_bg) ? v.tile_bg : d.tile_bg,
    bar_bg: v.bar_bg && HEX.test(v.bar_bg) ? v.bar_bg : '',
    hidden_category_ids: ids(v.hidden_category_ids),
  };
}

export async function fetchHomeAppLayoutAdmin(): Promise<HomeAppLayoutSettings> {
  const res = await fetch('/api/admin/home-app-layout');
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'Failed to load App Layout');
  return normalizeHomeAppLayout(body.settings);
}

export async function saveHomeAppLayout(settings: HomeAppLayoutSettings): Promise<void> {
  const res = await fetch('/api/admin/home-app-layout', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ settings }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'Failed to save App Layout');
}
