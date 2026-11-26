'use client';

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ChevronDown, MapPin, SlidersHorizontal, Video, VideoOff, X } from 'lucide-react';
import { Product } from '@/lib/types';
import { expandProductVariants } from '@/lib/expand-product-variants';
import ProductCard from '@/components/product-card';
import { FeaturedHighlight } from '@/components/featured-picks';
import QuickNavIcons from '@/components/quick-nav-icons';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import {
  fetchCatalogVideoSettings,
  fetchCatalogListingSettings,
  DEFAULT_CATALOG_LISTING_SETTINGS,
  CatalogListingSettings,
  fetchPriceRangeFilters,
  DEFAULT_PRICE_RANGE_FILTERS,
  PriceRangeBucket,
  getAvailablePriceBuckets,
} from '@/lib/settings-api';
import PaginationNav from '@/components/shop/pagination-nav';
import { checkPincodeServiceability } from '@/lib/pincode-api';
import { loadSavedLocation, saveLocation, type SavedLocation } from '@/components/product/pincode-checker';
import { getColorSwatchHex } from '@/lib/color-swatch';

const CATALOG_VIDEO_PREF_KEY = 'aruhi-catalog-video-enabled';

type SortKey =
  | 'featured'
  | 'popularity'
  | 'newest'
  | 'rating'
  | 'discount'
  | 'price-asc'
  | 'price-desc'
  | 'name-asc'
  | 'name-desc';

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'popularity', label: 'Popularity' },
  { key: 'newest', label: 'New Arrivals' },
  { key: 'rating', label: 'Top Rated' },
  { key: 'discount', label: 'Discount' },
  { key: 'price-asc', label: 'Price: Low to High' },
  { key: 'price-desc', label: 'Price: High to Low' },
  { key: 'name-asc', label: 'Name: A-Z' },
  { key: 'name-desc', label: 'Name: Z-A' },
];

type FilterTab = 'price' | 'color' | 'fabric' | 'discount';
interface Filters {
  price: string[]; // PriceRangeBucket ids
  color: string[]; // lower-cased colour names
  fabric: string[];
  discount: number[]; // minimum % off
}
const EMPTY_FILTERS: Filters = { price: [], color: [], fabric: [], discount: [] };
const DISCOUNT_STEPS = [20, 30, 40, 50, 60];

const discountPct = (p: Product): number =>
  p.mrp && p.mrp > p.price ? Math.round((1 - p.price / p.mrp) * 100) : 0;

const colorsOf = (p: Product): string[] =>
  [...(p.all_colors ?? p.colors ?? []), ...(p.variant_list?.map((v) => v.color) ?? [])]
    .filter(Boolean)
    .map((c) => c.toLowerCase());

function Chip({
  active,
  onClick,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-[13px] transition-colors ${
        active
          ? 'border-primary bg-primary/10 font-semibold text-primary'
          : 'border-border bg-card text-foreground/80 hover:border-primary/50'
      }`}
    >
      {children}
    </button>
  );
}

interface CategoryToolbarGridProps {
  products: Product[];
  /** Category NAME (not slug) — /shop's `?category=` filter matches on
   *  the product's category name, same as every other link into it
   *  (footer, product-card "view all in category", related products). */
  categoryName: string;
  /** Initial popularity rank from server-side rendering.
   *  Passed to ensure the first page paint shows products in popularity order
   *  instead of waiting for the client-side fetch to complete. */
  initialPopularityRank?: Map<string, number>;
  /** productId -> best-performing colour variation (image/slug). See
   *  lib/top-variant-server.ts and the matching prop on ShopContent. */
  initialTopVariants?: Record<string, { color: string; image: string | null; slug: string | null }>;
  /** Real per-image blur previews (LQIP) for this category's products —
   *  see the matching prop on ShopContentProps for the full explanation. */
  blurPreviews?: Record<string, string>;
  /** Public URL of page 1 of this category, with trailing slash
   *  (e.g. /product-category/sarees/). Page N lives at `${basePath}page/N/`,
   *  exactly like the old WooCommerce site. Omit it (tag pages) and paging
   *  works in-page only, without changing the URL. */
  basePath?: string;
  /** Page number from the URL, so the server-rendered HTML already holds
   *  the right page of products (crawlers + shared links). */
  initialPage?: number;
  /** Admin > Settings > Catalog Listing Size, read on the server so the page
   *  size is the same on first paint and after hydration. */
  initialListingSettings?: CatalogListingSettings;
}

/**
 * Renders the same Filters/Sort bar shoppers already know from /shop —
 * plus the Home/Categories quick-nav icons — on top of a category page's
 * product grid, so browsing a single category isn't a dead-end missing
 * the sort control every other listing page has. This page doesn't carry
 * the full price/size/colour/fabric filter panel /shop has (that state
 * lives entirely client-side in shop-content.tsx); "Filters" here hands
 * off to /shop pre-filtered to this category instead of duplicating that
 * whole panel for a single-category view.
 */
export default function CategoryToolbarGrid({
  products,
  categoryName,
  initialPopularityRank = new Map(),
  initialTopVariants = {},
  blurPreviews = {},
  basePath,
  initialPage = 1,
  initialListingSettings,
}: CategoryToolbarGridProps) {
  const [sort, setSort] = useState<SortKey>('popularity');

  // Filters (Price / Colour / Fabric / Discount) live in one full-screen sheet
  // opened from the sticky chip bar at the top. Price bands are still the
  // admin-managed buckets (Admin > Catalog > Price Filters), narrowed to the
  // bands that actually have a product in THIS category/tag. Everything
  // filters this page's own grid client-side.
  const [priceBuckets, setPriceBuckets] = useState<PriceRangeBucket[]>(DEFAULT_PRICE_RANGE_FILTERS);
  useEffect(() => {
    let cancelled = false;
    fetchPriceRangeFilters()
      .then((ranges) => {
        if (!cancelled) setPriceBuckets(ranges);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  const visiblePriceBuckets = useMemo(
    () => getAvailablePriceBuckets(priceBuckets, products),
    [priceBuckets, products]
  );

  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [draft, setDraft] = useState<Filters>(EMPTY_FILTERS);
  const [filterOpen, setFilterOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [filterTab, setFilterTab] = useState<FilterTab>('price');
  const activeFilterCount =
    filters.price.length + filters.color.length + filters.fabric.length + filters.discount.length;

  // Drop a selected price band that no longer has any product (list changed).
  useEffect(() => {
    setFilters((f) => {
      const valid = f.price.filter((id) => visiblePriceBuckets.some((b) => b.id === id));
      return valid.length === f.price.length ? f : { ...f, price: valid };
    });
  }, [visiblePriceBuckets]);

  const colorOptions = useMemo(() => {
    const seen = new Map<string, string>();
    products.forEach((p) =>
      [...(p.all_colors ?? p.colors ?? []), ...(p.variant_list?.map((v) => v.color) ?? [])].forEach((c) => {
        if (c && !seen.has(c.toLowerCase())) seen.set(c.toLowerCase(), c);
      })
    );
    return Array.from(seen.entries())
      .map(([key, label]) => ({ key, label, count: products.filter((p) => colorsOf(p).includes(key)).length }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [products]);
  const fabricOptions = useMemo(
    () =>
      Array.from(new Set(products.map((p) => p.fabric).filter(Boolean)))
        .sort((a, b) => a.localeCompare(b))
        .map((f) => ({ key: f, label: f, count: products.filter((p) => p.fabric === f).length })),
    [products]
  );
  const discountOptions = useMemo(
    () =>
      DISCOUNT_STEPS.map((min) => ({
        key: min,
        label: `${min}% & above`,
        count: products.filter((p) => discountPct(p) >= min).length,
      })).filter((o) => o.count > 0),
    [products]
  );
  const priceOptions = useMemo(
    () =>
      visiblePriceBuckets.map((b) => ({
        key: b.id,
        label: b.label,
        count: products.filter((p) => p.price >= b.min && p.price <= b.max).length,
      })),
    [visiblePriceBuckets, products]
  );
  const filterTabs = (
    [
      ['price', 'Price', priceOptions.length],
      ['color', 'Colour', colorOptions.length],
      ['fabric', 'Fabric', fabricOptions.length],
      ['discount', 'Discount', discountOptions.length],
    ] as [FilterTab, string, number][]
  ).filter(([, , n]) => n > 0);

  const openFilters = (tab: FilterTab) => {
    setDraft(filters);
    setFilterTab(tab);
    setFilterOpen(true);
  };
  const toggleDraft = <K extends keyof Filters>(key: K, value: Filters[K][number]) => {
    setDraft((d) => {
      const arr = d[key] as (string | number)[];
      const next = arr.includes(value) ? arr.filter((x) => x !== value) : [...arr, value];
      return { ...d, [key]: next } as Filters;
    });
  };
  const removeFilter = <K extends keyof Filters>(key: K, value: Filters[K][number]) =>
    setFilters((f) => ({ ...f, [key]: (f[key] as (string | number)[]).filter((x) => x !== value) } as Filters));

  const priceFilteredProducts = useMemo(() => {
    return products.filter((p) => {
      if (filters.price.length) {
        const ok = visiblePriceBuckets.some((b) => filters.price.includes(b.id) && p.price >= b.min && p.price <= b.max);
        if (!ok) return false;
      }
      if (filters.color.length && !filters.color.some((c) => colorsOf(p).includes(c))) return false;
      if (filters.fabric.length && !filters.fabric.includes(p.fabric)) return false;
      if (filters.discount.length && discountPct(p) < Math.min(...filters.discount)) return false;
      return true;
    });
  }, [products, filters, visiblePriceBuckets]);

  // Delivery pincode -- same localStorage entry the product page's pincode
  // checker uses, so a pincode saved here is remembered there and vice versa.
  const [loc, setLoc] = useState<SavedLocation | null>(null);
  const [pinOpen, setPinOpen] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinMsg, setPinMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pinBusy, setPinBusy] = useState(false);
  useEffect(() => {
    setLoc(loadSavedLocation());
  }, []);
  const openPin = () => {
    setPinInput(loc?.pincode ?? '');
    setPinMsg(null);
    setPinOpen(true);
  };
  const submitPin = async () => {
    const code = pinInput.trim();
    if (!/^[1-9][0-9]{5}$/.test(code)) {
      setPinMsg({ ok: false, text: 'Please enter a valid 6-digit pincode' });
      return;
    }
    setPinBusy(true);
    try {
      const res = await checkPincodeServiceability(code);
      if (res.serviceable) {
        saveLocation(res);
        setLoc({ ...res, savedAt: Date.now() });
        setPinMsg({ ok: true, text: res.message || 'Delivery available' });
        setTimeout(() => setPinOpen(false), 700);
      } else {
        setPinMsg({ ok: false, text: res.message || 'Sorry, we cannot deliver to this pincode yet' });
      }
    } catch {
      setPinMsg({ ok: false, text: 'Could not check right now. Please try again.' });
    } finally {
      setPinBusy(false);
    }
  };

  const [popularityRank, setPopularityRank] = useState<Map<string, number>>(initialPopularityRank);
  const [topVariants, setTopVariants] = useState<Record<string, { color: string; image: string | null; slug: string | null }>>(
    initialTopVariants
  );
  useEffect(() => {
    // Refresh popularity data every 10 minutes (same cache period as the API)
    // to keep up with new purchases/views, but the server-side initial data
    // means the first paint is already in the right order.
    const interval = setInterval(() => {
      fetch('/api/products/popularity')
        .then((r) => r.json())
        .then(({ ranked }: { ranked: string[] }) => {
          setPopularityRank(new Map(ranked.map((id: string, i: number) => [id, i])));
        })
        .catch(() => {});
      fetch('/api/top-variants')
        .then((r) => r.json())
        .then(({ variants }: { variants: Record<string, { color: string; image: string | null; slug: string | null }> }) => {
          setTopVariants(variants ?? {});
        })

        .catch(() => {});
    }, 10 * 60 * 1000); // 10 minutes
    return () => clearInterval(interval);
  }, []);

  // Same shopper-facing "Video" toggle as /shop (see app/shop/shop-content.tsx
  // for the fuller rationale) -- shares the same localStorage key so a
  // shopper's choice carries across /shop and every category page instead
  // of resetting per page.
  const [videoEnabled, setVideoEnabled] = useState(true);
  useEffect(() => {
    let cancelled = false;
    const stored = typeof window !== 'undefined' ? window.localStorage.getItem(CATALOG_VIDEO_PREF_KEY) : null;
    if (stored === 'on' || stored === 'off') {
      setVideoEnabled(stored === 'on');
      return;
    }
    fetchCatalogVideoSettings()
      .then((s) => {
        if (!cancelled) setVideoEnabled(s.default_enabled);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  const toggleVideoEnabled = (checked: boolean) => {
    setVideoEnabled(checked);
    try {
      window.localStorage.setItem(CATALOG_VIDEO_PREF_KEY, checked ? 'on' : 'off');
    } catch {
      // Private browsing / storage blocked -- toggle still works for this
      // page view, it just won't be remembered next visit.
    }
  };

  const sorted = useMemo(() => {
    const list = [...priceFilteredProducts];
    switch (sort) {
      case 'price-asc':
        list.sort((a, b) => a.price - b.price);
        break;
      case 'price-desc':
        list.sort((a, b) => b.price - a.price);
        break;
      case 'rating':
        list.sort((a, b) => b.rating - a.rating);
        break;
      case 'discount':
        list.sort((a, b) => discountPct(b) - discountPct(a));
        break;
      case 'name-asc':
        list.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case 'name-desc':
        list.sort((a, b) => b.name.localeCompare(a.name));
        break;
      case 'newest':
        list.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
        break;
      case 'popularity':
        list.sort((a, b) => {
          const ra = popularityRank.has(a.id) ? popularityRank.get(a.id)! : Infinity;
          const rb = popularityRank.has(b.id) ? popularityRank.get(b.id)! : Infinity;
          if (ra !== rb) return ra - rb;
          // Same product family: base card first, then variant cards
          const aIsVariant = !!(a as any).isVariantCard;
          const bIsVariant = !!(b as any).isVariantCard;
          if (aIsVariant !== bIsVariant) return aIsVariant ? 1 : -1;
          return Number(!!b.featured) - Number(!!a.featured) || b.rating - a.rating;
        });
        break;
      default:
        list.sort((a, b) => Number(!!b.featured) - Number(!!a.featured));
    }
    return list;
  }, [priceFilteredProducts, sort, popularityRank]);

  // Admin > Settings > Catalog Listing Size -- how many cards load per
  // page/batch, and how many colour cards one product may contribute to
  // this grid (see lib/expand-product-variants.ts). Falls back to the
  // same defaults this page always used if the setting hasn't been
  // saved yet or fails to load, so nothing breaks/blanks while it's
  // still fetching.
  const [listingSettings, setListingSettings] = useState(initialListingSettings ?? DEFAULT_CATALOG_LISTING_SETTINGS);
  useEffect(() => {
    let cancelled = false;
    fetchCatalogListingSettings()
      .then((s) => {
        if (!cancelled) setListingSettings(s);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Numbered pages (Previous / 1 2 3 / Next) in the old WooCommerce URL format:
  // page 1 = /product-category/sarees/, page 2 = /product-category/sarees/page/2/.
  // The server renders the right page for crawlers and shared links, and the
  // pagination links are real <a href> links Google can follow. Changing sort
  // or the price chip goes back to page 1 so a narrowed list never stays on a
  // stale page number.
  const PAGE_SIZE = Math.max(1, listingSettings.page_size);
  const [page, setPage] = useState(Math.max(1, Math.floor(initialPage) || 1));
  const gridTopRef = useRef<HTMLDivElement>(null);
  const hrefFor = (n: number) => (!basePath ? '#' : n > 1 ? `${basePath}page/${n}/` : basePath);
  const syncUrl = (n: number) => {
    if (basePath && typeof window !== 'undefined') {
      window.history.replaceState(window.history.state, '', hrefFor(n));
    }
  };
  const filterKey = JSON.stringify([sort, filters, PAGE_SIZE]);
  const lastFilterKey = useRef(filterKey);
  useEffect(() => {
    if (lastFilterKey.current === filterKey) return;
    lastFilterKey.current = filterKey;
    setPage(1);
    syncUrl(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const goToPage = (n: number) => {
    const next = Math.min(Math.max(1, n), totalPages);
    setPage(next);
    syncUrl(next);
    gridTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const visibleProducts = sorted.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const sortLabel = SORT_OPTIONS.find((o) => o.key === sort)?.label ?? 'Popularity';
  const appliedTags: { key: string; label: string; remove: () => void }[] = [
    ...filters.price.map((id) => ({
      key: `p-${id}`,
      label: visiblePriceBuckets.find((b) => b.id === id)?.label ?? 'Price',
      remove: () => removeFilter('price', id),
    })),
    ...filters.color.map((c) => ({
      key: `c-${c}`,
      label: colorOptions.find((o) => o.key === c)?.label ?? c,
      remove: () => removeFilter('color', c),
    })),
    ...filters.fabric.map((f) => ({ key: `f-${f}`, label: f, remove: () => removeFilter('fabric', f) })),
    ...filters.discount.map((d) => ({ key: `d-${d}`, label: `${d}% & above`, remove: () => removeFilter('discount', d) })),
  ];

  const renderOptions = () => {
    const rows: { key: string | number; label: string; count: number; swatch?: string; group: keyof Filters }[] =
      filterTab === 'price'
        ? priceOptions.map((o) => ({ ...o, group: 'price' as const }))
        : filterTab === 'color'
        ? colorOptions.map((o) => ({ ...o, swatch: getColorSwatchHex(o.label), group: 'color' as const }))
        : filterTab === 'fabric'
        ? fabricOptions.map((o) => ({ ...o, group: 'fabric' as const }))
        : discountOptions.map((o) => ({ ...o, group: 'discount' as const }));
    return rows.map((o) => (
      <label key={`${o.group}-${o.key}`} className="flex cursor-pointer items-center gap-3 py-3 text-sm">
        <input
          type="checkbox"
          className="h-4 w-4 accent-[hsl(var(--primary))]"
          checked={(draft[o.group] as (string | number)[]).includes(o.key)}
          onChange={() => toggleDraft(o.group, o.key as never)}
        />
        {o.swatch && (
          <span className="h-4 w-4 shrink-0 rounded-full border border-border" style={{ background: o.swatch }} />
        )}
        <span>{o.label}</span>
        <span className="text-xs text-muted-foreground">({o.count})</span>
      </label>
    ));
  };

  return (
    <>
      {/* Delivery location strip (not sticky -- scrolls away like the reference) */}
      <button
        type="button"
        onClick={openPin}
        className={`mt-4 flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-[13px] ${
          loc ? 'bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200' : 'bg-muted text-foreground/80'
        }`}
      >
        <MapPin className="h-4 w-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate">
          {loc ? (
            <>
              Delivering to <b>{loc.pincode}</b>
              {loc.city ? ` · ${loc.city}` : ''}
            </>
          ) : (
            'Select a location to see delivery availability'
          )}
        </span>
        <span className="shrink-0 text-xs font-semibold text-primary">{loc ? 'CHANGE' : 'ADD PINCODE'}</span>
      </button>

      {/* Sticky Filters / Sort bar, directly under the 48px site header */}
      <div className="sticky top-12 z-30 mt-3 border-b border-border/60 bg-background/95 py-2 backdrop-blur-sm">
        <div className="flex items-center gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <QuickNavIcons />
          <Chip active={activeFilterCount > 0} onClick={() => openFilters(filterTabs[0]?.[0] ?? 'price')}>
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
          </Chip>
          <Chip active={sort !== 'popularity'} onClick={() => setSortOpen(true)}>
            Sort: {sortLabel} <ChevronDown className="h-3 w-3" />
          </Chip>
          {filterTabs.map(([tab, label]) => (
            <Chip key={tab} active={filters[tab].length > 0} onClick={() => openFilters(tab)}>
              {label} <ChevronDown className="h-3 w-3" />
            </Chip>
          ))}
          <button
            type="button"
            onClick={() => toggleVideoEnabled(!videoEnabled)}
            aria-label={videoEnabled ? 'Turn off video previews' : 'Turn on video previews'}
            aria-pressed={videoEnabled}
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-colors ${
              videoEnabled
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-background text-foreground/70'
            }`}
          >
            {videoEnabled ? <Video className="h-4 w-4" /> : <VideoOff className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {appliedTags.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {appliedTags.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={t.remove}
              className="flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs"
            >
              {t.label} <X className="h-3 w-3" />
            </button>
          ))}
          <button type="button" onClick={() => setFilters(EMPTY_FILTERS)} className="text-xs font-semibold text-primary">
            Clear all
          </button>
        </div>
      )}

      {sorted.length === 0 && (
        <div className="mt-8 rounded-2xl border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
          No sarees match these filters.
          <div className="mt-3">
            <Button variant="outline" size="sm" onClick={() => setFilters(EMPTY_FILTERS)}>
              Clear filters
            </Button>
          </div>
        </div>
      )}

      {/* Sort sheet */}
      <Sheet open={sortOpen} onOpenChange={setSortOpen}>
        <SheetContent side="bottom" aria-describedby={undefined} className="mx-auto max-w-lg rounded-t-2xl p-0">
          <SheetTitle className="px-5 pb-2 pt-5 text-base">Sort by</SheetTitle>
          <div className="pb-[max(1rem,env(safe-area-inset-bottom))]">
            {SORT_OPTIONS.map((o) => (
              <button
                key={o.key}
                type="button"
                onClick={() => {
                  setSort(o.key);
                  setSortOpen(false);
                }}
                className={`flex w-full items-center border-t border-border/60 px-5 py-3.5 text-left text-sm ${
                  sort === o.key ? 'bg-primary/5 font-semibold text-primary' : ''
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </SheetContent>
      </Sheet>

      {/* Pincode sheet */}
      <Sheet open={pinOpen} onOpenChange={setPinOpen}>
        <SheetContent side="bottom" className="mx-auto max-w-lg rounded-t-2xl">
          <SheetTitle className="text-base">Select Delivery Location</SheetTitle>
          <SheetDescription className="sr-only">Enter your pincode to check delivery.</SheetDescription>
          <form
            className="mt-4 flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void submitPin();
            }}
          >
            <Input
              inputMode="numeric"
              autoComplete="postal-code"
              maxLength={6}
              placeholder="Enter Delivery Pincode"
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
              className="h-11 text-base"
            />
            <Button type="submit" disabled={pinBusy} className="h-11">
              {pinBusy ? 'Checking...' : 'CHECK'}
            </Button>
          </form>
          {pinMsg && (
            <p className={`mt-3 text-sm ${pinMsg.ok ? 'text-emerald-700' : 'text-destructive'}`}>{pinMsg.text}</p>
          )}
          <p className="mt-3 pb-[env(safe-area-inset-bottom)] text-xs text-muted-foreground">
            We will remember this pincode on your next visits.
          </p>
        </SheetContent>
      </Sheet>

      {/* Full-screen filter sheet */}
      <Sheet open={filterOpen} onOpenChange={setFilterOpen}>
        <SheetContent
          side="bottom"
          hideClose
          aria-describedby={undefined}
          className="mx-auto flex h-[100dvh] max-w-lg flex-col gap-0 p-0 sm:max-w-lg"
        >
          <div className="flex items-center gap-3 border-b border-border px-4 py-3.5">
            <button type="button" onClick={() => setFilterOpen(false)} aria-label="Close filters">
              <ArrowLeft className="h-5 w-5" />
            </button>
            <SheetTitle className="text-base">Filter by</SheetTitle>
          </div>
          <div className="flex min-h-0 flex-1">
            <div className="w-[36%] overflow-y-auto bg-muted/50">
              {filterTabs.map(([tab, label]) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setFilterTab(tab)}
                  className={`block w-full border-b border-border/60 px-3 py-4 text-left text-[13px] ${
                    filterTab === tab ? 'bg-background font-semibold text-primary' : 'text-foreground/80'
                  }`}
                >
                  {label}
                  {draft[tab].length > 0 ? ` (${draft[tab].length})` : ''}
                </button>
              ))}
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-1">{renderOptions()}</div>
          </div>
          <div className="flex border-t border-border pb-[env(safe-area-inset-bottom)]">
            <button
              type="button"
              onClick={() => setFilterOpen(false)}
              className="flex-1 py-4 text-sm font-semibold text-muted-foreground"
            >
              CANCEL
            </button>
            <button
              type="button"
              onClick={() => {
                setFilters(draft);
                setFilterOpen(false);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="flex-1 border-l border-border py-4 text-sm font-semibold text-primary"
            >
              APPLY
            </button>
          </div>
        </SheetContent>
      </Sheet>

      <div ref={gridTopRef} className="mt-4 scroll-mt-24 grid grid-flow-row-dense grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {expandProductVariants(visibleProducts, listingSettings.max_variant_cards_per_product).map((p, i) => {
          // Show this product's best-performing colour instead of always
          // its default -- skipped for already-exploded per-colour cards,
          // which already show one specific colour on purpose.
          const topVariant = !p.isVariantCard ? topVariants[p.id] : undefined;
          return (
            <Fragment key={`${p.id}-${p.slug}`}>
            <ProductCard
              product={p}
              priority={i < 4}
              imageOverride={topVariant?.image || undefined}
              slugOverride={topVariant?.slug || undefined}
              disableAutoplayVideo={!videoEnabled || !!p.isVariantCard}
              blurPreviews={blurPreviews}
            />
            {/* Trending strip after the first 3 products -- admin toggle, default OFF. */}
            {i === 2 && (
              <FeaturedHighlight
                placement="category"
                products={sorted}
                excludeIds={visibleProducts.slice(0, 3).map((x) => x.id)}
              />
            )}
            </Fragment>
          );
        })}
      </div>

      <PaginationNav
        currentPage={currentPage}
        totalPages={totalPages}
        hrefFor={hrefFor}
        onNavigate={goToPage}
      />
    </>
  );
}
