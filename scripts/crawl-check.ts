/**
 * npm run crawl:check -- [baseUrl] [--sitemaps] [--spam] [--max=80]
 *
 * Default: crawls key URLs and prints status, canonical, robots meta, h1 count, title length.
 *   --sitemaps : also reads robots.txt + sitemap_index.xml + every child sitemap and checks that each listed URL
 *                is 200 (no redirect), indexable and self-canonical (first --max URLs per sitemap).
 *   --spam     : requests every URL in spam-urls.txt and expects HTTP 410.
 * Needs Node 18+. Run it against production AFTER deploy (or http://localhost:3000 with `npm run start`).
 */
import { readFileSync, existsSync } from 'fs';

const args = process.argv.slice(2);
const base = (args.find((a) => /^https?:\/\//.test(a)) || 'https://www.sutisaree.com').replace(/\/$/, '');
const flag = (n: string) => args.includes(`--${n}`);
const max = Number((args.find((a) => a.startsWith('--max=')) || '--max=80').split('=')[1]);

type Row = { url: string; status: number; canonical: string; robots: string; h1: number; title: number; notes: string[] };

async function get(url: string) {
  const res = await fetch(url, { redirect: 'manual', headers: { 'user-agent': 'suti-crawl-check/1.0' } });
  const body = res.status === 200 ? await res.text() : '';
  return { res, body };
}

function inspect(url: string, status: number, body: string, xrobots: string | null): Row {
  const attr = (re: RegExp) => body.match(re)?.[1] ?? '';
  const canonical = attr(/<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']+)["']/i) || attr(/<link[^>]+href=["']([^"']+)["'][^>]*rel=["']canonical["']/i);
  const robots = attr(/<meta[^>]+name=["']robots["'][^>]*content=["']([^"']+)["']/i) || attr(/<meta[^>]+content=["']([^"']+)["'][^>]*name=["']robots["']/i);
  const h1 = (body.match(/<h1[\s>]/gi) || []).length;
  const title = attr(/<title[^>]*>([^<]*)<\/title>/i).trim().length;
  const notes: string[] = [];
  if (status !== 200) notes.push(`status ${status}`);
  if (status === 200) {
    if (!canonical) notes.push('no canonical');
    else if (canonical.replace(/\/$/, '') !== url.replace(/\/$/, '')) notes.push('canonical differs');
    else if (canonical.endsWith('/') !== url.endsWith('/')) notes.push('canonical slash mismatch');
    if (/noindex/i.test(robots) || /noindex/i.test(xrobots || '')) notes.push('NOINDEX');
    if (h1 !== 1) notes.push(`h1=${h1}`);
    if (title === 0 || title > 65) notes.push(`title ${title}`);
  }
  return { url, status, canonical, robots, h1, title, notes };
}

async function check(url: string): Promise<Row> {
  try {
    const { res, body } = await get(url);
    return inspect(url, res.status, body, res.headers.get('x-robots-tag'));
  } catch (e) {
    return { url, status: 0, canonical: '', robots: '', h1: 0, title: 0, notes: [`fetch failed: ${(e as Error).message}`] };
  }
}

const print = (r: Row) =>
  console.log(`${r.notes.length ? 'WARN' : 'ok  '} ${String(r.status).padEnd(3)} h1=${r.h1} title=${String(r.title).padEnd(3)} robots=${r.robots || '-'} canonical=${r.canonical || '-'}  ${r.url}  ${r.notes.join('; ')}`);

const locs = (xml: string) => Array.from(xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)).map((m) => m[1].replace(/&amp;/g, '&'));

async function main() {
  let problems = 0;
  const key = ['/', '/shop/', '/blog/', '/blog/how-to-wear-a-cotton-saree/', '/blog/handloom-vs-mill-cotton-saree/', '/blog/cotton-saree-care-guide/', '/blog/office-wear-cotton-sarees/', '/blog/cotton-sarees-under-500/', '/about-us/', '/contact-us/'].map((p) => base + p);

  // category URLs come from the live product_cat sitemap (they may use the old /product-category/... path)
  try {
    const cat = locs((await get(`${base}/product_cat-sitemap.xml`)).body);
    for (const slug of ['cotton-saree', 'sarees', 'mulmul-saree', 'plain-saree']) {
      const hit = cat.find((u) => u.replace(/\/$/, '').endsWith(`/${slug}`) || u.endsWith(`/category/${slug}/`));
      if (hit) key.push(hit); else console.log(`WARN category "${slug}" not found in product_cat-sitemap.xml`);
    }
    const prod = locs((await get(`${base}/product-sitemap.xml`)).body).filter((u) => u.includes('/product/'));
    if (prod[0]) key.push(prod[0]);
  } catch { console.log('WARN could not read category/product sitemaps'); }

  console.log(`\n== Key URLs (${base}) ==`);
  for (const u of key) { const r = await check(u); print(r); if (r.notes.length) problems++; }

  if (flag('sitemaps')) {
    console.log('\n== robots.txt ==');
    const robots = (await get(`${base}/robots.txt`)).body;
    const hasSitemap = /^sitemap:\s*\S*sitemap_index\.xml/im.test(robots);
    const blocksAll = /user-agent:\s*\*\s*[\r\n]+(?:(?!user-agent)[^\r\n]*[\r\n]+)*?disallow:\s*\/\s*$/im.test(robots);
    console.log(`${hasSitemap ? 'ok  ' : 'WARN'} lists sitemap_index.xml`);
    console.log(`${blocksAll ? 'WARN' : 'ok  '} "User-agent: *" does ${blocksAll ? '' : 'not '}block the whole site`);
    if (!hasSitemap || blocksAll) problems++;

    console.log('\n== Sitemaps ==');
    const idx = await get(`${base}/sitemap_index.xml`);
    console.log(`${idx.res.status === 200 ? 'ok  ' : 'WARN'} sitemap_index.xml -> ${idx.res.status}`);
    for (const child of locs(idx.body)) {
      const { res, body } = await get(child);
      const urls = locs(body);
      console.log(`${res.status === 200 ? 'ok  ' : 'WARN'} ${child} -> ${res.status}, ${urls.length} URLs`);
      if (res.status !== 200) { problems++; continue; }
      const dup = urls.length - new Set(urls).size;
      if (dup) { console.log(`WARN ${dup} duplicate URLs in ${child}`); problems++; }
      for (const u of urls.slice(0, max)) {
        const { res: r2, body: b2 } = await get(u);
        const row = inspect(u, r2.status, b2, r2.headers.get('x-robots-tag'));
        // product pages: h1 / title rules are the same, so only print problems to keep output short
        if (row.notes.length) { print(row); problems++; }
      }
    }
  }

  if (flag('spam')) {
    console.log('\n== Spam URLs must be 410 ==');
    const f = 'spam-urls.txt';
    if (!existsSync(f)) throw new Error('spam-urls.txt not found (run from repo root)');
    const urls = readFileSync(f, 'utf8').split(/\r?\n/).filter(Boolean).map((u) => u.replace(/^https?:\/\/[^/]+/, base));
    let bad = 0;
    for (const u of urls) {
      const { res } = await get(u);
      if (res.status !== 410) { console.log(`WARN ${res.status} (want 410) ${u}`); bad++; }
    }
    console.log(`${bad ? 'WARN' : 'ok  '} ${urls.length - bad}/${urls.length} spam URLs return 410`);
    problems += bad;
  }

  console.log(`\nDone. ${problems} problem(s).`);
  process.exit(problems ? 1 : 0);
}
main();
