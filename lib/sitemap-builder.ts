import { getServerSupabase } from '@/lib/supabase-server';
import { ProductRow, CategoryRow } from '@/lib/types';
import { LEGAL_PAGE_TITLES } from '@/lib/marketing-api';
import { fetchPublishedBlogPostsServer } from '@/lib/blog-api-server';
import { toPublicMediaUrl, toPublicMediaUrls } from '@/lib/media-url';
import { categoryPath } from '@/lib/category-url';
import { REDIRECTED_TAG_SLUGS } from '@/lib/seo-redirects';
import { fetchCatalogListingSettings, DEFAULT_CATALOG_LISTING_SETTINGS } from '@/lib/settings-api';

// Rank Math style split sitemaps. The OLD WordPress site served:
//   /sitemap_index.xml -> post-sitemap.xml, page-sitemap.xml,
//   product-sitemap.xml, product-sitemap2.xml (200 URLs per file),
//   category-sitemap.xml, product_cat-sitemap.xml, product_tag-sitemap.xml
// This module rebuilds exactly that structure (same file names, same 200/file split).

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.sutisaree.com').replace(/\/$/, '');

// Rank Math "items_per_page" from the old site's settings = 200.
export const ITEMS_PER_SITEMAP = 200;

// Rank Math NEVER lists /page/2/, /page/3/ ... in its sitemaps (only the first page of a
// shop/category/tag archive). Keep false to match the old sitemap. Pagination pages are
// still crawlable through the numbered links on the page itself.
export const INCLUDE_PAGINATION_IN_SITEMAP = false;

// Supabase/PostgREST caps unbounded selects at 1000 rows by default. As the
// catalog grows past that, a plain `.select()` would silently drop rows from
// the sitemap -- so we page through everything explicitly instead of trusting
// the default limit.
const PAGE_SIZE = 1000;

export async function fetchAllRows<T>(
  table: string,
  columns: string,
  applyFilter?: (query: any) => any
): Promise<T[]> {
  const supabase = getServerSupabase();
  const rows: T[] = [];
  let from = 0;

  while (true) {
    let query = supabase.from(table).select(columns).range(from, from + PAGE_SIZE - 1);
    if (applyFilter) query = applyFilter(query);
    const { data, error } = await query;
    if (error) {
      console.error(`sitemap: failed to fetch ${table}`, error);
      break;
    }
    if (!data || data.length === 0) break;
    rows.push(...(data as T[]));
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return rows;
}

// Turns a raw images array (which may hold relative storage paths, or
// absolute Supabase Storage URLs) into absolute own-domain URLs, since
// Google's image sitemap extension requires full URLs. Routing Supabase
// URLs through toPublicMediaUrl means the sitemap always advertises
// sutisaree.com URLs, not the storage provider's host -- see
// lib/media-url.ts for why.
export function toAbsoluteImageUrls(images: string[] | null | undefined): string[] {
  if (!images || images.length === 0) return [];
  const absolute = images
    .filter((img): img is string => !!img)
    .map((img) =>
      img.startsWith('http://') || img.startsWith('https://')
        ? img
        : `${SITE_URL}${img.startsWith('/') ? '' : '/'}${img}`
    );
  return toPublicMediaUrls(absolute);
}

export type SitemapVideoEntry = {
  title: string;
  thumbnail_loc: string;
  description: string;
  content_loc: string;
};

// Builds the `videos` sitemap-extension entry for a product/variant that has
// a video_url set. Without this, a page's video is invisible to Google as
// "video content" -- it just sees on-page UI, never something eligible for
// the Search Console "Video" report or video search results. thumbnail_loc
// is required by Google's video sitemap spec, so entries without any usable
// image are skipped entirely rather than emitted with a missing thumbnail.
export function buildVideoEntry(
  videoUrl: string | null | undefined,
  title: string,
  description: string | null | undefined,
  images: string[]
): SitemapVideoEntry[] | undefined {
  if (!videoUrl) return undefined;
  const absoluteVideoUrl = videoUrl.startsWith('http://') || videoUrl.startsWith('https://')
    ? videoUrl
    : `${SITE_URL}${videoUrl.startsWith('/') ? '' : '/'}${videoUrl}`;
  // toAbsoluteImageUrls already routes through toPublicMediaUrls for the
  // thumbnail; the video file itself needs the same treatment here.
  const publicVideoUrl = toPublicMediaUrl(absoluteVideoUrl) || absoluteVideoUrl;
  const thumbnails = toAbsoluteImageUrls(images);
  if (thumbnails.length === 0) return undefined;

  return [
    {
      title,
      thumbnail_loc: thumbnails[0],
      description: (description || title).slice(0, 2048),
      content_loc: publicVideoUrl,
    },
  ];
}

export type SitemapEntry = {
  url: string;
  lastModified?: Date | string;
  changeFrequency?: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
  priority?: number;
  images?: string[];
  videos?: SitemapVideoEntry[];
};

// Escapes text that goes inside an XML element (loc, title, description...).
// Without this, a product name/description containing `&`, `<`, `>`, or
// quotes would produce invalid XML that Google (and some browsers) reject
// outright, rather than just that one entry being skipped.
export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function buildSitemapXml(entries: SitemapEntry[]): string {
  const hasImages = entries.some((e) => e.images && e.images.length > 0);
  const hasVideos = entries.some((e) => e.videos && e.videos.length > 0);

  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"';
  if (hasImages) xml += ' xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"';
  if (hasVideos) xml += ' xmlns:video="http://www.google.com/schemas/sitemap-video/1.1"';
  xml += '>\n';

  for (const entry of entries) {
    xml += '<url>\n';
    xml += `<loc>${escapeXml(entry.url)}</loc>\n`;
    if (entry.lastModified) {
      const serialized =
        entry.lastModified instanceof Date ? entry.lastModified.toISOString() : entry.lastModified;
      xml += `<lastmod>${serialized}</lastmod>\n`;
    }
    if (entry.changeFrequency) {
      xml += `<changefreq>${entry.changeFrequency}</changefreq>\n`;
    }
    if (typeof entry.priority === 'number') {
      xml += `<priority>${entry.priority}</priority>\n`;
    }
    if (entry.images) {
      for (const image of entry.images) {
        xml += `<image:image>\n<image:loc>${escapeXml(image)}</image:loc>\n</image:image>\n`;
      }
    }
    if (entry.videos) {
      for (const video of entry.videos) {
        xml += '<video:video>\n';
        xml += `<video:title>${escapeXml(video.title)}</video:title>\n`;
        xml += `<video:thumbnail_loc>${escapeXml(video.thumbnail_loc)}</video:thumbnail_loc>\n`;
        xml += `<video:description>${escapeXml(video.description)}</video:description>\n`;
        xml += `<video:content_loc>${escapeXml(video.content_loc)}</video:content_loc>\n`;
        xml += '</video:video>\n';
      }
    }
    xml += '</url>\n';
  }

  xml += '</urlset>\n';
  return xml;
}


export type SitemapKind = 'post' | 'page' | 'product' | 'product_cat' | 'product_tag';

type LiveProduct = Pick<ProductRow, 'id' | 'slug' | 'updated_at' | 'images' | 'name' | 'description' | 'video_url'> & {
  category_name: string;
  category_names: string[] | null;
};

async function loadLiveProducts(): Promise<LiveProduct[]> {
  return fetchAllRows<LiveProduct>(
    'products',
    'id, slug, updated_at, images, category_name, category_names, name, description, video_url',
    (q) => q.eq('approval_status', 'live')
  );
}

async function listingPageSize(): Promise<number> {
  try {
    return Math.max(1, (await fetchCatalogListingSettings()).page_size);
  } catch {
    return DEFAULT_CATALOG_LISTING_SETTINGS.page_size;
  }
}

function extraPages(base: string, items: number, pageSize: number, priority: number): SitemapEntry[] {
  if (!INCLUDE_PAGINATION_IN_SITEMAP) return [];
  const count = Math.max(1, Math.ceil(items / pageSize));
  return Array.from({ length: count - 1 }, (_, i) => ({
    url: `${base}page/${i + 2}/`,
    lastModified: new Date(),
    changeFrequency: 'weekly' as const,
    priority,
  }));
}

// ---- post-sitemap.xml (blog posts) -------------------------------------------------
async function postEntries(): Promise<SitemapEntry[]> {
  const posts = await fetchPublishedBlogPostsServer();
  return posts.map((p) => ({
    url: `${SITE_URL}/blog/${p.slug}/`,
    lastModified: new Date(p.updated_at || p.published_at),
  }));
}

// ---- page-sitemap.xml (static pages, same public URLs the old WP pages had) --------
async function pageEntries(): Promise<SitemapEntry[]> {
  const OLD_LEGAL_PATH: Record<string, string> = {
    'privacy-policy': 'privacy-policy',
    'terms-conditions': 'terms-and-conditions',
    'shipping-policy': 'shipping-delivery-information',
    'refund-policy': 'returns-exchange',
  };
  // Fixed date: using new Date() made every static page's lastmod change on each request.
  const now = new Date('2026-10-22T00:00:00.000Z');
  const paths = [
    '/',
    '/shop/',
    '/blog/',
    '/about-us/',
    '/contact-us/',
    ...Object.keys(LEGAL_PAGE_TITLES).map((slug) => `/${OLD_LEGAL_PATH[slug] || slug}/`),
  ];
  const pageSize = await listingPageSize();
  const products = INCLUDE_PAGINATION_IN_SITEMAP ? await loadLiveProducts() : [];
  return [
    ...paths.map((p) => ({ url: p === '/' ? `${SITE_URL}/` : `${SITE_URL}${p}`, lastModified: now })),
    ...extraPages(`${SITE_URL}/shop/`, products.length, pageSize, 0.6),
  ];
}

// ---- product-sitemap.xml, product-sitemap2.xml ... (parent products ONLY) -----------
// Colour variants (/product/<variant-slug>/) are deliberately NOT listed: the old
// WooCommerce sitemap listed only the 352 parent products, never variations.
async function productEntries(): Promise<SitemapEntry[]> {
  const products = await loadLiveProducts();
  return products.map((p) => {
    const images = toAbsoluteImageUrls(p.images);
    const videos = buildVideoEntry(p.video_url, p.name, p.description, p.images || []);
    return {
      url: `${SITE_URL}/product/${p.slug}/`,
      lastModified: p.updated_at ? new Date(p.updated_at) : new Date(),
      ...(images.length > 0 ? { images } : {}),
      ...(videos ? { videos } : {}),
    };
  });
}

// ---- product_cat-sitemap.xml (/product-category/...) --------------------------------
async function productCatEntries(): Promise<SitemapEntry[]> {
  const [products, categories, pageSize] = await Promise.all([
    loadLiveProducts(),
    fetchAllRows<Pick<CategoryRow, 'slug' | 'name'> & { woo_path?: string | null }>(
      'categories',
      'slug, name, woo_path'
    ),
    listingPageSize(),
  ]);
  // Empty categories are noindex on the page, so (like Rank Math) they stay out.
  return categories.flatMap((c) => {
    const inCategory = products.filter(
      (p) => p.category_name === c.name || (p.category_names ?? []).includes(c.name)
    );
    if (inCategory.length === 0) return [];
    const base = `${SITE_URL}${categoryPath(c)}`;
    const latest = inCategory.reduce((m, p) => (p.updated_at && p.updated_at > m ? p.updated_at : m), '');
    return [
      { url: base, lastModified: latest ? new Date(latest) : new Date() },
      ...extraPages(base, inCategory.length, pageSize, 0.5),
    ];
  });
}

// ---- product_tag-sitemap.xml (/product-tag/<slug>/) ---------------------------------
async function productTagEntries(): Promise<SitemapEntry[]> {
  const [products, tags, links, pageSize] = await Promise.all([
    loadLiveProducts(),
    fetchAllRows<{ id: string; slug: string }>('tags', 'id, slug'),
    fetchAllRows<{ product_id: string; tag_id: string }>('product_tags', 'product_id, tag_id'),
    listingPageSize(),
  ]);
  const byId = new Map(products.map((p) => [p.id, p]));
  const perTag = new Map<string, { count: number; latest: string }>();
  for (const l of links) {
    const p = byId.get(l.product_id);
    if (!p) continue; // not live -> does not count
    const cur = perTag.get(l.tag_id) || { count: 0, latest: '' };
    cur.count += 1;
    if (p.updated_at && p.updated_at > cur.latest) cur.latest = p.updated_at;
    perTag.set(l.tag_id, cur);
  }
  // A tag page with no live products is noindex, so it is skipped here too.
  // Tags that next.config.js 301s elsewhere are skipped too (final URL only).
  return tags.flatMap((t) => {
    if (REDIRECTED_TAG_SLUGS.has(t.slug)) return [];
    const info = perTag.get(t.id);
    if (!info) return [];
    const base = `${SITE_URL}/product-tag/${t.slug}/`;
    return [
      { url: base, lastModified: info.latest ? new Date(info.latest) : new Date() },
      ...extraPages(base, info.count, pageSize, 0.5),
    ];
  });
}

async function entriesFor(kind: SitemapKind): Promise<SitemapEntry[]> {
  switch (kind) {
    case 'post': return postEntries();
    case 'page': return pageEntries();
    case 'product': return productEntries();
    case 'product_cat': return productCatEntries();
    case 'product_tag': return productTagEntries();
  }
}

export function isSitemapKind(v: string): v is SitemapKind {
  return ['post', 'page', 'product', 'product_cat', 'product_tag'].includes(v);
}

// One sitemap file. `part` is 1-based (product-sitemap.xml = 1, product-sitemap2.xml = 2).
// Returns null when the file does not exist (unknown part or empty sitemap).
export async function buildSitemapFile(kind: SitemapKind, part: number): Promise<string | null> {
  const all = await entriesFor(kind);
  const slice = all.slice((part - 1) * ITEMS_PER_SITEMAP, part * ITEMS_PER_SITEMAP);
  if (slice.length === 0) return null;
  return buildSitemapXml(slice);
}

// sitemap_index.xml: same file names as Rank Math. Only non-empty sitemaps are listed.
export async function buildSitemapIndexXml(): Promise<string> {
  const kinds: SitemapKind[] = ['post', 'page', 'product', 'product_cat', 'product_tag'];
  const results = await Promise.all(
    kinds.map(async (k) => ({ k, entries: await entriesFor(k).catch(() => [] as SitemapEntry[]) }))
  );
  const files: { loc: string; lastmod?: string }[] = [];
  for (const { k, entries } of results) {
    const parts = Math.ceil(entries.length / ITEMS_PER_SITEMAP);
    for (let i = 1; i <= parts; i++) {
      const chunk = entries.slice((i - 1) * ITEMS_PER_SITEMAP, i * ITEMS_PER_SITEMAP);
      const latest = chunk.reduce((m, e) => {
        const t = e.lastModified ? new Date(e.lastModified).getTime() : 0;
        return t > m ? t : m;
      }, 0);
      files.push({
        loc: `${SITE_URL}/${k}-sitemap${i === 1 ? '' : i}.xml`,
        lastmod: latest ? new Date(latest).toISOString() : undefined,
      });
    }
  }
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
  for (const f of files) {
    xml += `<sitemap>\n<loc>${escapeXml(f.loc)}</loc>\n`;
    if (f.lastmod) xml += `<lastmod>${f.lastmod}</lastmod>\n`;
    xml += '</sitemap>\n';
  }
  xml += '</sitemapindex>\n';
  return xml;
}
