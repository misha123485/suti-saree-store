// Finds product / variant images smaller than 500x500 px. Google Merchant Center requires image_link
// images to be at least 500x500 from 31 Jan 2027, so replace every file in the CSV before that date.
//
//   npx tsx scripts/check-image-sizes.ts                      # all products + variants
//   npx tsx scripts/check-image-sizes.ts --limit 20           # only the first 20 products (quick test)
//   npx tsx scripts/check-image-sizes.ts --out my.csv --concurrency 8 --timeout 20000 --retries 2
//   (or: npm run check:image-sizes)
//
// Needs NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY (shell or .env.local) and internet access to
// the image URLs (they are fetched exactly as the feed publishes them: own-domain, ORIGINAL file, never -sm/-md).
// Pixel size is read with `sharp`, which is ALREADY a dependency of this project (no new dependency).
// Writes images-below-500x500.csv (only images with a problem) and prints a summary. Read-only.
import { loadEnvFiles, loadCatalog, writeCsv } from './catalog-loader';
import { toFeedImageUrl, isThumbnailUrl } from '../lib/feed-images';

const MIN = 500;

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(name);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

interface Ref { productId: string; variantId: string; slug: string; rawUrl: string; url: string | null }
interface Result { width: number; height: number; error: string }

async function fetchWithRetry(url: string, timeoutMs: number, retries: number): Promise<{ buf: Buffer | null; error: string }> {
  let lastErr = '';
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: ctl.signal, redirect: 'follow' });
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        clearTimeout(timer);
        return { buf, error: '' };
      }
      lastErr = `http_${res.status}`;
      clearTimeout(timer);
      if (res.status >= 400 && res.status < 500 && res.status !== 429 && res.status !== 408) break; // not worth retrying
    } catch (e: any) {
      clearTimeout(timer);
      lastErr = e && e.name === 'AbortError' ? 'timeout' : `network_error:${(e && e.message) || e}`;
    }
    await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
  }
  return { buf: null, error: lastErr || 'fetch_failed' };
}

async function main() {
  loadEnvFiles();
  const sharp = (await import('sharp')).default;
  const outFile = arg('--out', 'images-below-500x500.csv');
  const concurrency = Math.max(1, parseInt(arg('--concurrency', '8'), 10) || 8);
  const timeoutMs = Math.max(1000, parseInt(arg('--timeout', '20000'), 10) || 20000);
  const retries = Math.max(0, parseInt(arg('--retries', '2'), 10) || 2);
  const limit = parseInt(arg('--limit', '0'), 10) || 0;
  const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.sutisaree.com').replace(/\/+$/, '');

  console.log('Loading products and variants ...');
  const catalog = await loadCatalog();
  const products = limit > 0 ? catalog.products.slice(0, limit) : catalog.products;

  const refs: Ref[] = [];
  for (const p of products) {
    for (const raw of p.images || []) refs.push({ productId: p.id, variantId: '', slug: p.slug, rawUrl: raw, url: toFeedImageUrl(raw, SITE_URL) });
    for (const v of catalog.variantsByProduct.get(p.id) ?? []) {
      for (const raw of v.images || []) refs.push({ productId: p.id, variantId: v.id, slug: v.slug || p.slug, rawUrl: raw, url: toFeedImageUrl(raw, SITE_URL) });
    }
  }
  const unique = Array.from(new Set(refs.map((r) => r.url).filter((u): u is string => !!u)));
  console.log(`${products.length} products, ${refs.length} image references, ${unique.length} unique image files. Checking (concurrency ${concurrency}) ...`);

  const results = new Map<string, Result>();
  let done = 0;
  let next = 0;
  async function worker() {
    while (next < unique.length) {
      const url = unique[next++];
      const { buf, error } = await fetchWithRetry(url, timeoutMs, retries);
      let r: Result = { width: 0, height: 0, error };
      if (buf) {
        try {
          const meta = await sharp(buf, { failOn: 'none' }).metadata();
          let w = meta.width || 0;
          let h = meta.height || 0;
          if (meta.orientation && meta.orientation >= 5) { const t = w; w = h; h = t; } // EXIF-rotated photos
          r = w > 0 && h > 0 ? { width: w, height: h, error: '' } : { width: 0, height: 0, error: 'not_an_image' };
        } catch {
          r = { width: 0, height: 0, error: 'not_an_image' };
        }
      }
      results.set(url, r);
      done++;
      if (done % 50 === 0 || done === unique.length) process.stdout.write(`\r  ${done}/${unique.length}`);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, unique.length || 1) }, worker));
  process.stdout.write('\n');

  const out: unknown[][] = [];
  const badProducts = new Set<string>();
  let small = 0;
  let failed = 0;
  let smallest = { w: Infinity, h: Infinity, url: '' };
  for (const ref of refs) {
    const reasons: string[] = [];
    let w: number | string = '';
    let h: number | string = '';
    if (!ref.url) {
      reasons.push('unusable_url');
    } else {
      const r = results.get(ref.url)!;
      if (r.error) { reasons.push(`fetch_failed:${r.error}`); }
      else {
        w = r.width; h = r.height;
        if (r.width < MIN || r.height < MIN) {
          reasons.push(`below_${MIN}x${MIN}`);
          if (r.width * r.height < smallest.w * smallest.h) smallest = { w: r.width, h: r.height, url: ref.url };
        }
      }
    }
    if (isThumbnailUrl(ref.rawUrl)) reasons.push('db_url_is_thumbnail(-sm/-md): the feed maps it to the original, fix the stored url');
    if (reasons.length === 0) continue;
    badProducts.add(ref.productId);
    if (reasons.some((x) => x.indexOf('below_') === 0)) small++;
    if (reasons.some((x) => x.indexOf('fetch_failed') === 0 || x === 'unusable_url')) failed++;
    out.push([ref.productId, ref.variantId, ref.slug, ref.url || ref.rawUrl, w, h, reasons.join('; ')]);
  }
  writeCsv(outFile, ['product_id', 'variant_id', 'slug', 'image_url', 'width', 'height', 'reason'], out);

  console.log('\n=== SUMMARY ===');
  console.log(`unique image files checked : ${unique.length}`);
  console.log(`references below ${MIN}x${MIN}    : ${small}`);
  console.log(`unreachable / unreadable   : ${failed}`);
  console.log(`products affected          : ${badProducts.size}`);
  if (smallest.url) console.log(`smallest image             : ${smallest.w}x${smallest.h}  ${smallest.url}`);
  console.log(`\nCSV written: ${outFile}  (${out.length} rows) -> replace these images before 31 Jan 2027.`);
  process.exit(small > 0 || failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(2); });
