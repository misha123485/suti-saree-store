'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';

/** Page numbers to show: always first, last, current and its neighbours,
 *  with 'gap' where numbers are skipped. */
function pageWindow(current: number, total: number): (number | 'gap')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const keep = new Set<number>([1, total, current - 1, current, current + 1]);
  if (current <= 3) [2, 3, 4].forEach((n) => keep.add(n));
  if (current >= total - 2) [total - 1, total - 2, total - 3].forEach((n) => keep.add(n));
  const sorted = Array.from(keep).filter((n) => n >= 1 && n <= total).sort((a, b) => a - b);
  const out: (number | 'gap')[] = [];
  sorted.forEach((n, i) => {
    if (i > 0 && n - sorted[i - 1] > 1) out.push('gap');
    out.push(n);
  });
  return out;
}

interface PaginationNavProps {
  currentPage: number;
  totalPages: number;
  /** Real URL for page n (e.g. /product-category/sarees/page/2/) so Google can follow it. */
  hrefFor: (n: number) => string;
  /** Called on a normal click; the link is a real <a href>, this just avoids a full reload. */
  onNavigate: (n: number) => void;
}

/** Same look as the numbered pagination on /shop (Previous / 1 2 3 / Next). */
export default function PaginationNav({ currentPage, totalPages, hrefFor, onNavigate }: PaginationNavProps) {
  if (totalPages <= 1) return null;
  const click = (n: number) => (e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    onNavigate(n);
  };
  return (
    <nav aria-label="Pagination" className="mt-10 flex flex-wrap items-center justify-center gap-2">
      <div className="order-1 flex w-full items-center justify-center gap-1 sm:order-2 sm:w-auto">
        {pageWindow(currentPage, totalPages).map((n, i) =>
          n === 'gap' ? (
            <span key={`gap-${i}`} className="px-1 text-muted-foreground" aria-hidden="true">
              …
            </span>
          ) : (
            <a
              key={n}
              href={hrefFor(n)}
              aria-label={`Page ${n}`}
              aria-current={n === currentPage ? 'page' : undefined}
              onClick={click(n)}
              className={`flex h-9 min-w-9 items-center justify-center rounded-full border px-2 text-sm font-medium transition-colors ${
                n === currentPage
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-card text-foreground hover:border-primary hover:text-primary'
              }`}
            >
              {n}
            </a>
          )
        )}
      </div>
      {currentPage > 1 ? (
        <a
          href={hrefFor(currentPage - 1)}
          rel="prev"
          onClick={click(currentPage - 1)}
          className="order-2 flex h-10 flex-1 items-center justify-center gap-1 rounded-full border border-border bg-card px-4 text-sm font-medium hover:border-primary hover:text-primary sm:order-1 sm:flex-none"
        >
          <ChevronLeft className="h-4 w-4" />
          Previous
        </a>
      ) : (
        <span className="order-2 flex h-10 flex-1 items-center justify-center gap-1 rounded-full border border-border/60 px-4 text-sm text-muted-foreground/50 sm:order-1 sm:flex-none">
          <ChevronLeft className="h-4 w-4" />
          Previous
        </span>
      )}
      {currentPage < totalPages ? (
        <a
          href={hrefFor(currentPage + 1)}
          rel="next"
          onClick={click(currentPage + 1)}
          className="order-3 flex h-10 flex-1 items-center justify-center gap-1 rounded-full border border-primary bg-primary px-4 text-sm font-medium text-primary-foreground sm:flex-none"
        >
          Next
          <ChevronRight className="h-4 w-4" />
        </a>
      ) : (
        <span className="order-3 flex h-10 flex-1 items-center justify-center gap-1 rounded-full border border-border/60 px-4 text-sm text-muted-foreground/50 sm:flex-none">
          Next
          <ChevronRight className="h-4 w-4" />
        </span>
      )}
      <p className="order-4 w-full text-center text-xs text-muted-foreground">
        Page {currentPage} of {totalPages}
      </p>
    </nav>
  );
}
