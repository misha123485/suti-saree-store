import Link from 'next/link';
import type { CategoryRow } from '@/lib/types';
import { categoryPath } from '@/lib/category-url';
import { FulfillmentSettings, returnWindowText } from '@/lib/marketing-api';

export interface ShopFaq {
  q: string;
  a: string;
}

/** Shared by the visible FAQ below and the FAQPage JSON-LD in page.tsx, so
 *  the structured data always matches what shoppers can read on the page. */
export function getShopFaqs(fulfillment: FulfillmentSettings): ShopFaq[] {
  return [
    {
      q: 'Is Cash on Delivery available?',
      a: 'Yes, Cash on Delivery is available on eligible orders. You can also pay online with UPI, cards or netbanking.',
    },
    {
      q: 'Can I return a saree?',
      a: `Yes. You can request a return within ${returnWindowText(fulfillment)} of delivery and we pick the saree up from your home.`,
    },
    {
      q: 'Are these sarees really handloom?',
      a: 'Our sarees are handloom pieces sourced directly from weavers across India. Small colour or weave variations are natural in handloom.',
    },
  ];
}

/**
 * Plain server-rendered text under the product grid (page 1 only): a short
 * description, crawlable links to every category, and an FAQ. No client JS,
 * so Google and AI search tools read it straight from the HTML.
 */
export default function ShopSeoContent({
  categories,
  faqs,
}: {
  categories: CategoryRow[];
  faqs: ShopFaq[];
}) {
  return (
    <section className="container-boutique mt-4 border-t border-border/60 pb-24 pt-8 md:pb-12">
      <h2 className="font-serif text-xl font-bold text-primary">Buy handloom sarees online</h2>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
        Sutisaree brings handwoven cotton, mulmul and silk sarees straight from weaver families to your door.
        Every saree is soft, light and made for daily wear, festivals and office days. Browse the full
        collection above or jump to a category below.
      </p>

      {categories.length > 0 && (
        <nav aria-label="Shop by category" className="mt-4 flex flex-wrap gap-2">
          {categories.slice(0, 16).map((c) => (
            <Link
              key={c.slug}
              href={categoryPath(c)}
              className="rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium hover:border-primary hover:text-primary"
            >
              {c.name}
            </Link>
          ))}
        </nav>
      )}

      <h2 className="mt-8 font-serif text-xl font-bold text-primary">Questions people ask</h2>
      <div className="mt-3 flex max-w-3xl flex-col gap-2">
        {faqs.map((f) => (
          <details key={f.q} className="rounded-xl border border-border bg-card px-4 py-3 text-sm">
            <summary className="cursor-pointer font-semibold">{f.q}</summary>
            <p className="mt-2 leading-relaxed text-muted-foreground">{f.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
