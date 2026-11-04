import Link from 'next/link';
import Image from 'next/image';
import { Sparkles } from 'lucide-react';
import type { CategoryRow } from '@/lib/types';
import type { HomeAppLayoutSettings } from '@/lib/home-app-layout';

export interface AppCategoryItem {
  category: CategoryRow;
  thumb?: string;
}

/**
 * App-style primary category tab bar (Flipkart/Meesho style) — a single
 * horizontally scrollable row pinned right under the site header.
 * First tab is the "For You" (home) tab; the rest are the admin-picked
 * primary categories (Admin > App Layout).
 *
 * Deliberately a server component with plain <Link>s: zero client JS,
 * so it adds nothing to hydration cost.
 */
export default function AppCategoryBar({
  items,
  layout,
}: {
  items: AppCategoryItem[];
  layout: HomeAppLayoutSettings;
}) {
  if (!layout.show_for_you_tab && items.length === 0) return null;

  return (
    <nav
      aria-label="Primary categories"
      className="sticky top-12 z-30 border-b border-border/60 bg-background/95 backdrop-blur-sm"
      style={layout.bar_bg ? { backgroundColor: layout.bar_bg } : undefined}
    >
      <ul className="flex gap-1 overflow-x-auto px-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:justify-center">
        {layout.show_for_you_tab && (
          <li className="shrink-0">
            <Link
              href="/"
              aria-current="page"
              className="relative flex w-[68px] flex-col items-center gap-1 px-1 pb-2 pt-2 text-primary"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                <Sparkles className="h-5 w-5" />
              </span>
              <span className="text-[11px] font-semibold leading-none">{layout.for_you_label}</span>
              <span className="absolute inset-x-3 bottom-0 h-[3px] rounded-t-full bg-primary" />
            </Link>
          </li>
        )}
        {items.map(({ category, thumb }) => (
          <li key={category.id} className="shrink-0">
            <Link
              href={`/category/${category.slug}`}
              prefetch={false}
              className="flex w-[68px] flex-col items-center gap-1 px-1 pb-2 pt-2 text-foreground/80 transition-colors hover:text-primary"
            >
              <span className="relative h-10 w-10 overflow-hidden rounded-xl bg-muted">
                {thumb ? (
                  <Image
                    src={thumb}
                    alt=""
                    fill
                    sizes="40px"
                    className="object-cover"
                  />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-xs font-semibold text-muted-foreground">
                    {category.name.slice(0, 1)}
                  </span>
                )}
              </span>
              <span className="line-clamp-1 w-full text-center text-[11px] font-medium leading-none">
                {category.name}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
