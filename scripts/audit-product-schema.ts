// Audits EXACTLY what the product pages would publish as Product JSON-LD (lib/product-jsonld.ts) and what
// the product feed would use as <g:id>, for every live product / colour variant / size.
//
//   npx tsx scripts/audit-product-schema.ts                       # writes product-schema-audit.csv
//   npx tsx scripts/audit-product-schema.ts --out my-report.csv
//   (or: npm run audit:product-schema)
//
// Needs NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY (shell or .env.local). Read-only.
//
// It reports:
//   * JSON-LD that would be invalid: no offers, price <= 0 / NaN / missing, empty or invalid sku,
//     empty image, empty description      -> these are the "Either offers, review, or aggregateRating
//                                             should be specified" items in Search Console (Product snippets)
//   * SKU problems (Merchant listings "invalid sku"): empty / non-string / invalid characters / > 50 chars /
//     duplicate feed ids, in products.sku, product_variants.sku, product_variant_sizes.sku and in the ids
//     the feed actually sends
//   * products whose products.rating / products.reviews columns disagree with the REAL approved reviews
//     (informational: those columns are never used for the schema any more)
import { loadEnvFiles, loadCatalog, loadRealReviewCounts, writeCsv } from './catalog-loader';
import { buildProductJsonLd, validateProductJsonLd } from '../lib/product-jsonld';
import { feedOfferId, findDuplicateIds, skuProblem } from '../lib/feed-ids';
import { descriptionToPlainText } from '../lib/description-text';
import { toFeedImageUrls } from '../lib/feed-images';

interface Row {
  severity: 'ERROR' | 'WARN' | 'INFO';
  productId: string;
  slug: string;
  variantId: string;
  variantSlug: string;
  size: string;
  problem: string;
  detail: string;
  feedId: string;
}

async function main() {
  loadEnvFiles();
  const outIdx = process.argv.indexOf('--out');
  const outFile = outIdx > -1 && process.argv[outIdx + 1] ? process.argv[outIdx + 1] : 'product-schema-audit.csv';
  const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.sutisaree.com').replace(/\/+$/, '');

  console.log('Loading products, variants and reviews ...');
  const { products, variantsByProduct } = await loadCatalog();
  const realReviews = await loadRealReviewCounts();
  console.log(`  ${products.length} live products, ${Array.from(variantsByProduct.values()).reduce((n, l) => n + l.length, 0)} colour variants`);

  const rows: Row[] = [];
  const feedIds: string[] = [];
  const add = (r: Row) => rows.push(r);

  for (const p of products) {
    const variants = variantsByProduct.get(p.id) ?? [];
    const common = { productId: p.id, slug: p.slug };

    // ---- raw data problems (reason WHY a page would be invalid) ----
    const priceOk = typeof p.price === 'number' && isFinite(p.price) && p.price > 0;
    if (!priceOk) add({ ...common, severity: 'ERROR', variantId: '', variantSlug: '', size: '', problem: 'product_price_missing_or_zero', detail: `products.price = ${JSON.stringify(p.price)}`, feedId: '' });
    if (!descriptionToPlainText(p.description)) add({ ...common, severity: 'WARN', variantId: '', variantSlug: '', size: '', problem: 'description_empty', detail: 'products.description is empty (feed/JSON-LD fall back to the product name)', feedId: '' });
    if (toFeedImageUrls(p.images || []).length === 0 && !variants.some((v) => toFeedImageUrls(v.images || []).length > 0)) {
      add({ ...common, severity: 'ERROR', variantId: '', variantSlug: '', size: '', problem: 'image_empty', detail: 'no usable image on the product or any variant', feedId: '' });
    }
    const pSku = skuProblem(p.sku);
    if (pSku && pSku !== 'empty') add({ ...common, severity: 'WARN', variantId: '', variantSlug: '', size: '', problem: `db_product_sku_${pSku}`, detail: `products.sku = ${JSON.stringify(p.sku)}`, feedId: '' });

    // ---- the pages / feed items ----
    type Page = { variant: any; sizeParam: string; slug: string; variantId: string; size: string };
    const pages: Page[] = [{ variant: null, sizeParam: '', slug: p.slug, variantId: '', size: '' }];
    for (const v of variants) {
      const sizes = (v.product_variant_sizes ?? []).map((s) => ({ size: s.size, stock_quantity: s.stock_quantity, price_override: s.price_override }));
      const variant = { id: v.id, color: v.color, images: v.images ?? [], price_override: v.price_override, sizes };
      const vSku = skuProblem(v.sku);
      if (vSku && vSku !== 'empty') add({ ...common, severity: 'WARN', variantId: v.id, variantSlug: v.slug, size: '', problem: `db_variant_sku_${vSku}`, detail: `product_variants.sku = ${JSON.stringify(v.sku)}`, feedId: '' });
      if (v.price_override !== null && v.price_override !== undefined && !(v.price_override > 0)) {
        add({ ...common, severity: 'ERROR', variantId: v.id, variantSlug: v.slug, size: '', problem: 'variant_price_override_zero_or_negative', detail: `product_variants.price_override = ${v.price_override}`, feedId: '' });
      }
      if (sizes.length === 0) {
        pages.push({ variant, sizeParam: '', slug: v.slug, variantId: v.id, size: '' });
        feedIds.push(feedOfferId({ productId: p.id, variantId: v.id }));
      } else {
        for (const s of v.product_variant_sizes ?? []) {
          const sProblem = skuProblem(s.sku);
          if (sProblem && sProblem !== 'empty') add({ ...common, severity: 'WARN', variantId: v.id, variantSlug: v.slug, size: s.size, problem: `db_size_sku_${sProblem}`, detail: `product_variant_sizes.sku = ${JSON.stringify(s.sku)}`, feedId: '' });
          if (s.price_override !== null && s.price_override !== undefined && !(s.price_override > 0)) {
            add({ ...common, severity: 'ERROR', variantId: v.id, variantSlug: v.slug, size: s.size, problem: 'size_price_override_zero_or_negative', detail: `product_variant_sizes.price_override = ${s.price_override}`, feedId: '' });
          }
          pages.push({ variant, sizeParam: s.size, slug: v.slug, variantId: v.id, size: s.size });
          feedIds.push(feedOfferId({ productId: p.id, variantId: v.id, size: s.size }));
        }
      }
    }
    if (variants.length === 0) feedIds.push(feedOfferId({ productId: p.id }));

    for (const pg of pages) {
      const ld = buildProductJsonLd({
        siteUrl: SITE_URL,
        slug: pg.slug,
        sizeParam: pg.sizeParam,
        brand: 'Sutisaree',
        displayName: p.name,
        description: p.description,
        product: p,
        variant: pg.variant,
        reviews: [], // validity of offers/sku/image does not depend on reviews
      }) as any;
      for (const problem of validateProductJsonLd(ld)) {
        // an unusable price is already reported once per product above; keep per-page rows too (they show which URL breaks)
        add({
          ...common,
          severity: 'ERROR',
          variantId: pg.variantId,
          variantSlug: pg.variant ? pg.slug : '',
          size: pg.size,
          problem,
          detail: `offers.price=${ld.offers && ld.offers.price} sku=${JSON.stringify(ld.sku)}`,
          feedId: ld.sku || '',
        });
      }
    }

    // ---- stale rating columns (informational) ----
    const real = realReviews.get(p.id) ?? 0;
    if ((p.reviews > 0 || p.rating > 0) && real === 0) {
      add({ ...common, severity: 'INFO', variantId: '', variantSlug: '', size: '', problem: 'stale_rating_columns', detail: `products.rating=${p.rating}, products.reviews=${p.reviews} but 0 real approved reviews (ignored by the schema)`, feedId: '' });
    }
  }

  // ---- duplicate / invalid feed ids across the whole feed ----
  for (const id of findDuplicateIds(feedIds)) {
    add({ severity: 'ERROR', productId: '', slug: '', variantId: '', variantSlug: '', size: '', problem: 'duplicate_feed_id', detail: `the id "${id}" is sent for more than one feed item`, feedId: id });
  }
  for (const id of feedIds) {
    if (!id || id.length > 50 || /[^A-Za-z0-9._-]/.test(id)) {
      add({ severity: 'ERROR', productId: '', slug: '', variantId: '', variantSlug: '', size: '', problem: 'invalid_feed_id', detail: JSON.stringify(id), feedId: id });
    }
  }

  writeCsv(outFile, ['severity', 'product_id', 'slug', 'variant_id', 'variant_slug', 'size', 'problem', 'detail', 'feed_id'],
    rows.map((r) => [r.severity, r.productId, r.slug, r.variantId, r.variantSlug, r.size, r.problem, r.detail, r.feedId]));

  // ---------------- summary ----------------
  const byProblem = new Map<string, number>();
  for (const r of rows) byProblem.set(r.problem, (byProblem.get(r.problem) ?? 0) + 1);
  console.log('\n=== SUMMARY ===');
  console.log(`feed items checked: ${feedIds.length}`);
  Array.from(byProblem.entries()).sort((a, b) => b[1] - a[1]).forEach(([k, n]) => console.log(`  ${String(n).padStart(6)}  ${k}`));

  const badOffer = new Map<string, { slug: string; why: Set<string> }>();
  for (const r of rows) {
    if (r.productId && /price|no_offers|no_availability|no_offer_url/.test(r.problem) && r.severity === 'ERROR') {
      const e = badOffer.get(r.productId) ?? { slug: r.slug, why: new Set<string>() };
      e.why.add(r.problem + (r.detail ? ` (${r.detail})` : ''));
      badOffer.set(r.productId, e);
    }
  }
  console.log(`\nProducts whose offer is invalid (no usable price/offer): ${badOffer.size}`);
  Array.from(badOffer.entries()).forEach(([id, e]) => console.log(`  ${id}  ${e.slug}  -> ${Array.from(e.why).slice(0, 2).join(' | ')}`));

  const skuRows = rows.filter((r) => /sku|feed_id/.test(r.problem));
  console.log(`\nSKU problems (invalid / duplicate): ${skuRows.length}`);
  skuRows.slice(0, 50).forEach((r) => console.log(`  [${r.severity}] ${r.problem}  product=${r.productId || '-'} ${r.slug}  variant=${r.variantSlug || '-'}  size=${r.size || '-'}  ${r.detail}`));

  console.log(`\nFull report: ${outFile}  (${rows.length} rows)`);
  process.exit(rows.some((r) => r.severity === 'ERROR') ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(2); });
