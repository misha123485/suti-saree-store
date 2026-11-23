// Pure JSON-LD builders (no I/O) so they can be unit-tested with plain `tsx`.
import { BRAND_ALTERNATE_NAMES, BRAND_NAME, SITE_URL } from '@/lib/seo-site';

export interface Crumb {
  name: string;
  /** Absolute URL, or a path starting with "/". */
  url: string;
}

function abs(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `${SITE_URL}${url.startsWith('/') ? '' : '/'}${url}`;
}

/** The SAME array drives the visible breadcrumb and this schema, so they cannot drift. */
export function buildBreadcrumbJsonLd(crumbs: Crumb[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c.name,
      item: abs(c.url),
    })),
  };
}

export function buildFaqJsonLd(faqs: { question: string; answer: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      name: f.question,
      acceptedAnswer: { '@type': 'Answer', text: f.answer },
    })),
  };
}

/** Keeps only valid absolute http(s) profile URLs, de-duplicated, in a stable order. */
export function cleanSameAs(urls: (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  for (const u of urls) {
    const v = (u || '').trim();
    if (!/^https?:\/\/[^\s]+\.[^\s]+$/i.test(v)) continue;
    seen.add(v);
  }
  return Array.from(seen);
}

export function buildOrganizationJsonLd(opts: {
  logoUrl: string;
  sameAs: string[];
  email?: string;
  phone?: string;
}) {
  return {
    '@type': 'Organization',
    '@id': `${SITE_URL}/#organization`,
    name: BRAND_NAME,
    alternateName: BRAND_ALTERNATE_NAMES,
    url: SITE_URL,
    logo: abs(opts.logoUrl),
    ...(opts.sameAs.length > 0 ? { sameAs: opts.sameAs } : {}),
    ...(opts.email || opts.phone
      ? {
          contactPoint: {
            '@type': 'ContactPoint',
            contactType: 'customer service',
            ...(opts.email ? { email: opts.email } : {}),
            ...(opts.phone ? { telephone: opts.phone } : {}),
          },
        }
      : {}),
  };
}

export function buildWebSiteJsonLd(description: string) {
  return {
    '@type': 'WebSite',
    '@id': `${SITE_URL}/#website`,
    name: BRAND_NAME,
    alternateName: BRAND_ALTERNATE_NAMES,
    url: SITE_URL,
    description,
    publisher: { '@id': `${SITE_URL}/#organization` },
    // /search?q= is a real route (app/search/page.tsx).
    potentialAction: {
      '@type': 'SearchAction',
      target: { '@type': 'EntryPoint', urlTemplate: `${SITE_URL}/search?q={search_term_string}` },
      'query-input': 'required name=search_term_string',
    },
  };
}
