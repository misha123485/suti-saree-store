// Server-rendered SEO blocks for category pages. Plain HTML (no client JS) so the
// text and the links are in the first HTML response that Googlebot reads.
import Link from 'next/link';
import type { CategorySeoFaq, CategorySeoSection } from '@/lib/category-seo';
import type { ResolvedLink } from '@/lib/category-links';

export function CategoryGuide({ title, sections }: { title: string; sections: CategorySeoSection[] }) {
  if (sections.length === 0) return null;
  return (
    <section className="mt-10 border-t border-border/60 pt-8" aria-labelledby="buying-guide-heading">
      <h2 id="buying-guide-heading" className="font-serif text-2xl font-bold text-primary sm:text-3xl">
        {title}
      </h2>
      <div className="mt-3 max-w-3xl space-y-5 text-sm leading-relaxed text-muted-foreground sm:text-base">
        {sections.map((sec) => (
          <div key={sec.heading}>
            <h3 className="font-serif text-lg font-semibold text-foreground">{sec.heading}</h3>
            <p className="mt-1">{sec.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

export function CategoryFaq({ title, faqs }: { title: string; faqs: CategorySeoFaq[] }) {
  if (faqs.length === 0) return null;
  return (
    <section className="mt-10" aria-labelledby="faq-heading">
      <h2 id="faq-heading" className="font-serif text-2xl font-bold text-primary sm:text-3xl">
        {title}
      </h2>
      {/* <details> keeps every answer in the HTML (crawlable) while staying compact. */}
      <div className="mt-3 max-w-3xl divide-y divide-border/60 rounded-xl border border-border/60">
        {faqs.map((f) => (
          <details key={f.question} className="group p-4">
            <summary className="cursor-pointer list-none font-medium text-foreground marker:content-none">
              {f.question}
            </summary>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground sm:text-base">{f.answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

export function ExploreLinks({ title, links }: { title: string; links: ResolvedLink[] }) {
  if (links.length === 0) return null;
  return (
    <nav className="mt-10" aria-labelledby="explore-heading">
      <h2 id="explore-heading" className="font-serif text-2xl font-bold text-primary sm:text-3xl">
        {title}
      </h2>
      <ul className="mt-3 flex flex-wrap gap-2">
        {links.map((l) => (
          <li key={l.href}>
            <Link
              href={l.href}
              className="inline-block rounded-full border border-border px-4 py-1.5 text-sm text-foreground hover:border-primary hover:text-primary"
            >
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
