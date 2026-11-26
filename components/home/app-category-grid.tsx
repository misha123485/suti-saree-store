import Link from 'next/link';
import Image from 'next/image';
import CategoryScroller from './category-scroller';
import type { AppCategoryItem } from './app-category-bar';
import type { HomeAppLayoutSettings } from '@/lib/home-app-layout';

/**
 * "Shop by Category" as an app-style card grid: every visible category in
 * 2-4 rows (admin setting) that scrolls sideways together, ~4 cards visible
 * per screen. Each card = big photo + name with a chevron on a soft
 * gradient (no border). Server component, pure CSS, no client JS.
 */
export default function AppCategoryGrid({
  items,
  layout,
}: {
  items: AppCategoryItem[];
  layout: HomeAppLayoutSettings;
}) {
  if (!layout.show_grid || items.length === 0) return null;

  // Never use more rows than there are categories to fill (at least 2 per row).
  const rows = Math.max(1, Math.min(layout.grid_rows, Math.ceil(items.length / 2)));
  const picRadius = layout.tile_shape === 'circle' ? 'rounded-full' : 'rounded-xl';

  return (
    <section className="py-4">
      {layout.grid_title && (
        <div className="mb-3 px-4 text-center sm:container-boutique sm:px-0">
          <h2 className="font-serif text-xl font-bold text-primary sm:text-2xl">
            {layout.grid_title}
          </h2>
          <div className="mt-1.5 flex items-center justify-center gap-2" aria-hidden="true">
            <span className="h-px w-10 bg-gradient-to-r from-transparent to-secondary" />
            <span className="h-[5px] w-[5px] rotate-45 bg-secondary" />
            <span className="h-px w-10 bg-gradient-to-l from-transparent to-secondary" />
          </div>
        </div>
      )}
      <CategoryScroller className="snap-x snap-proximity overflow-x-auto px-3.5 pb-1 pt-1 [-ms-overflow-style:none] [scrollbar-width:none] sm:container-boutique sm:px-0 [&::-webkit-scrollbar]:hidden">
        <div
          className="grid w-max grid-flow-col gap-x-[9px] gap-y-3"
          style={{
            gridTemplateRows: `repeat(${rows}, auto)`,
            // ~4 cards visible on phones, a sliver of the 5th hints at scroll
            gridAutoColumns: 'clamp(66px, calc((100vw - 55px) / 4.25), 100px)',
          }}
        >
          {items.map(({ category, thumb }, idx) => (
            <Link
              key={category.id}
              href={`/category/${category.slug}`}
              prefetch={false}
              className="group flex snap-start flex-col items-center gap-1.5 rounded-[14px] px-[3px] pb-2 pt-1.5 text-center shadow-[0_6px_14px_-10px_hsl(var(--primary)/0.45)] transition-transform duration-200 active:scale-95"
              style={{
                background: `linear-gradient(180deg, #ffffff 0%, #ffffff 38%, ${layout.tile_bg} 100%)`,
              }}
            >
              <span className={`relative block aspect-square w-full overflow-hidden ${picRadius}`}>
                {thumb ? (
                  <Image
                    src={thumb}
                    alt={`${category.name} - handwoven Indian ethnic wear collection at Sutisaree`}
                    fill
                    sizes="100px"
                    priority={idx < 8}
                    className="object-cover"
                  />
                ) : (
                  <span className="flex h-full w-full items-center justify-center font-serif text-xl text-primary/60">
                    {category.name.slice(0, 1)}
                  </span>
                )}
              </span>
              <span className="flex min-h-[24px] items-center justify-center text-[10px] font-semibold leading-tight text-foreground sm:text-xs">
                <span className="line-clamp-2">{category.name}</span>
                <span className="ml-px text-xs leading-none text-primary" aria-hidden="true">›</span>
              </span>
            </Link>
          ))}
        </div>
      </CategoryScroller>
    </section>
  );
}
