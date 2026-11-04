import Link from 'next/link';
import Image from 'next/image';
import type { AppCategoryItem } from './app-category-bar';
import type { HomeAppLayoutSettings } from '@/lib/home-app-layout';

/**
 * "Shop by Category" as an app-style tile grid: every visible category in
 * 2 or 3 rows (admin setting) that scrolls sideways together — same feel
 * as the "New Arrivals / Festive Edit" rows in shopping apps. Server
 * component, no client JS.
 */
export default function AppCategoryGrid({
  items,
  layout,
}: {
  items: AppCategoryItem[];
  layout: HomeAppLayoutSettings;
}) {
  if (!layout.show_grid || items.length === 0) return null;

  // With few categories a 3-row layout would leave single dangling tiles;
  // never use more rows than we can fill.
  const rows = Math.max(1, Math.min(layout.grid_rows, Math.ceil(items.length / 3)));
  const radius = layout.tile_shape === 'circle' ? 'rounded-full' : 'rounded-2xl';

  return (
    <section className="py-4">
      {layout.grid_title && (
        <h2 className="mb-3 px-4 font-serif text-lg font-bold text-primary sm:container-boutique sm:px-0 sm:text-2xl">
          {layout.grid_title}
        </h2>
      )}
      <div className="overflow-x-auto px-4 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] sm:container-boutique sm:px-0 [&::-webkit-scrollbar]:hidden">
        <div
          className="grid w-max grid-flow-col gap-x-3 gap-y-3.5"
          style={{
            gridTemplateRows: `repeat(${rows}, auto)`,
            gridAutoColumns: '84px',
          }}
        >
          {items.map(({ category, thumb }, idx) => (
            <Link
              key={category.id}
              href={`/category/${category.slug}`}
              prefetch={false}
              className="group flex flex-col items-center gap-1.5 text-center"
            >
              <span
                className={`relative block aspect-square w-full overflow-hidden border border-black/5 p-1 shadow-sm transition-transform duration-200 group-active:scale-95 ${radius}`}
                style={{ backgroundColor: layout.tile_bg }}
              >
                {thumb ? (
                  <Image
                    src={thumb}
                    alt={`${category.name} - handwoven Indian ethnic wear collection at Sutisaree`}
                    fill
                    sizes="84px"
                    priority={idx < 6}
                    className={`!inset-1.5 !h-[calc(100%-12px)] !w-[calc(100%-12px)] object-cover ${layout.tile_shape === 'circle' ? 'rounded-full' : 'rounded-xl'}`}
                  />
                ) : (
                  <span className="flex h-full w-full items-center justify-center font-serif text-xl text-primary/60">
                    {category.name.slice(0, 1)}
                  </span>
                )}
              </span>
              <span className="line-clamp-2 text-[11px] font-semibold leading-tight text-foreground">
                {category.name}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
