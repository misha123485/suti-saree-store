// Validates the Google Product Reviews feed (schema v2.3) the way Merchant Center will.
//
// Usage:
//   npx tsx scripts/validate-reviews-feed.ts                          # fetches http://localhost:3000/api/product-reviews-feed
//   npx tsx scripts/validate-reviews-feed.ts https://www.sutisaree.com/api/product-reviews-feed
//   npx tsx scripts/validate-reviews-feed.ts --file feed.xml
//   npx tsx scripts/validate-reviews-feed.ts --self-test              # builds a sample feed from lib/product-reviews-feed.ts
//   (or: npm run validate:reviews-feed -- <url|--file x|--self-test>)
//
// Exit code 0 = no errors, 1 = errors found. No npm dependency needed (own tiny XML parser).
import fs from 'node:fs';
import { buildReviewsFeedXml, type FeedReview } from '../lib/product-reviews-feed';

// ---------- minimal well-formedness-checking XML parser ----------
interface XNode { name: string; attrs: Record<string, string>; children: XNode[]; text: string; line: number }

function parseXml(src: string): XNode {
  const errors: string[] = [];
  const root: XNode = { name: '#root', attrs: {}, children: [], text: '', line: 1 };
  const stack: XNode[] = [root];
  let i = 0;
  let line = 1;
  const advance = (to: number) => { for (; i < to; i++) if (src[i] === '\n') line++; };
  const fail = (msg: string): never => { throw new Error(`line ${line}: ${msg}`); };
  const checkText = (t: string) => {
    if (/<|[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(t)) fail('illegal character in text');
    const bad = t.match(/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/);
    if (bad) fail('bare "&" or unknown entity in text');
  };
  if (src.charCodeAt(0) === 0xfeff) i = 1;
  while (i < src.length) {
    if (src[i] !== '<') {
      const end = src.indexOf('<', i);
      const stop = end === -1 ? src.length : end;
      const t = src.slice(i, stop);
      checkText(t);
      stack[stack.length - 1].text += t;
      advance(stop);
      continue;
    }
    if (src.startsWith('<?', i)) { const e = src.indexOf('?>', i); if (e < 0) fail('unterminated <? ?>'); advance(e + 2); continue; }
    if (src.startsWith('<!--', i)) { const e = src.indexOf('-->', i); if (e < 0) fail('unterminated comment'); advance(e + 3); continue; }
    if (src.startsWith('<![CDATA[', i)) { const e = src.indexOf(']]>', i); if (e < 0) fail('unterminated CDATA'); stack[stack.length - 1].text += src.slice(i + 9, e); advance(e + 3); continue; }
    if (src.startsWith('<!', i)) { const e = src.indexOf('>', i); if (e < 0) fail('unterminated <! >'); advance(e + 1); continue; }
    if (src.startsWith('</', i)) {
      const m = /^<\/([A-Za-z_][\w:.-]*)\s*>/.exec(src.slice(i, i + 200));
      if (!m) fail('malformed closing tag');
      const open = stack.pop()!;
      if (stack.length === 0 || open.name !== m![1]) fail(`closing </${m![1]}> does not match <${open.name}>`);
      advance(i + m![0].length);
      continue;
    }
    const m = /^<([A-Za-z_][\w:.-]*)((?:\s+[A-Za-z_][\w:.-]*\s*=\s*(?:"[^"<]*"|'[^'<]*'))*)\s*(\/?)>/.exec(src.slice(i, i + 4000));
    if (!m) fail('malformed opening tag');
    const attrs: Record<string, string> = {};
    const re = /([A-Za-z_][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
    let a: RegExpExecArray | null;
    while ((a = re.exec(m![2]))) {
      if (a[1] in attrs) fail(`duplicate attribute ${a[1]}`);
      checkText(a[2] ?? a[3] ?? '');
      attrs[a[1]] = a[2] ?? a[3] ?? '';
    }
    const node: XNode = { name: m![1], attrs, children: [], text: '', line };
    stack[stack.length - 1].children.push(node);
    if (!m![3]) stack.push(node);
    advance(i + m![0].length);
  }
  if (stack.length !== 1) fail(`unclosed <${stack[stack.length - 1].name}>`);
  if (root.children.length !== 1) throw new Error('document must have exactly one root element');
  void errors;
  return root.children[0];
}

// ---------- schema v2.3 (tags Google defines) ----------
const ALLOWED: Record<string, string[]> = {
  feed: ['version', 'aggregator', 'publisher', 'reviews'],
  aggregator: ['name'],
  publisher: ['name', 'favicon'],
  reviews: ['review'],
  review: ['review_id', 'reviewer', 'review_timestamp', 'title', 'content', 'pros', 'cons', 'review_url', 'reviewer_images', 'ratings', 'products', 'is_spam', 'collection_method', 'transaction_id'],
  reviewer: ['name', 'reviewer_id', 'is_anonymous'],
  pros: ['pro'], cons: ['con'],
  reviewer_images: ['reviewer_image'], reviewer_image: ['url'],
  ratings: ['overall', 'pros', 'cons'],
  products: ['product'],
  product: ['product_ids', 'product_name', 'product_url'],
  product_ids: ['gtins', 'mpns', 'skus', 'brands', 'asins'],
  gtins: ['gtin'], mpns: ['mpn'], skus: ['sku'], brands: ['brand'], asins: ['asin'],
};
const LEAF = new Set(['version', 'name', 'favicon', 'review_id', 'reviewer_id', 'is_anonymous', 'review_timestamp', 'title', 'content', 'pro', 'con', 'review_url', 'url', 'overall', 'is_spam', 'collection_method', 'transaction_id', 'product_name', 'product_url', 'gtin', 'mpn', 'sku', 'brand', 'asin']);
const SINGLE = new Set(['version', 'publisher', 'reviews', 'review_id', 'reviewer', 'review_timestamp', 'title', 'content', 'review_url', 'ratings', 'products', 'is_spam', 'product_ids', 'product_name', 'product_url', 'gtins', 'mpns', 'skus', 'brands', 'asins', 'overall', 'collection_method', 'transaction_id']);
const REQUIRED_REVIEW = ['review_id', 'reviewer', 'review_timestamp', 'content', 'review_url', 'ratings', 'products'];

const PII = {
  email: /[A-Z0-9._%+'-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)+/i,
  phone: /\+?\d(?:[\s().-]?\d){8,}/,
  url: /\b(?:https?:\/\/|www\.)\S+/i,
  handle: /(^|[\s(])@[A-Za-z0-9._]{2,}/,
};
const HTML_LIKE = /<\/?[a-z][^>]*>|&lt;\/?[a-z]|&#0*60;/i;

function decode(s: string): string {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}
const val = (n: XNode) => decode(n.text).trim();

// ---------- validation ----------
function validate(xml: string) {
  const errors: string[] = [];
  const warnings: string[] = [];
  const err = (m: string) => errors.push(m);
  let root: XNode;
  try { root = parseXml(xml); } catch (e) { return { errors: [`XML is not well-formed: ${(e as Error).message}`], warnings, reviews: 0, ok: 0 }; }

  if (root.name !== 'feed') err(`root element must be <feed>, found <${root.name}>`);
  const walk = (n: XNode, path: string) => {
    const allowed = ALLOWED[n.name];
    if (LEAF.has(n.name)) {
      if (n.children.length) err(`<${n.name}> (line ${n.line}) must not contain child tags (found <${n.children[0].name}>)`);
      if (!val(n)) err(`empty <${n.name}> at line ${n.line} (${path})`);
    } else if (allowed) {
      const counts: Record<string, number> = {};
      for (const c of n.children) {
        if (!allowed.includes(c.name)) err(`unknown/unnecessary tag <${c.name}> inside <${n.name}> (line ${c.line})`);
        counts[c.name] = (counts[c.name] ?? 0) + 1;
      }
      for (const [k, c] of Object.entries(counts)) if (c > 1 && SINGLE.has(k)) err(`duplicate <${k}> inside <${n.name}> (line ${n.line})`);
      if (n.children.length === 0) err(`empty <${n.name}> at line ${n.line}`);
    } else {
      err(`unknown tag <${n.name}> at line ${n.line}`);
    }
    for (const c of n.children) walk(c, `${path}/${c.name}`);
  };
  walk(root, 'feed');

  const version = root.children.find((c) => c.name === 'version');
  if (!version || val(version) !== '2.3') err('<version> must be 2.3');
  const pubName = root.children.find((c) => c.name === 'publisher')?.children.find((c) => c.name === 'name');
  if (!pubName || !val(pubName)) err('<publisher><name> is required');

  const reviewsEl = root.children.find((c) => c.name === 'reviews');
  const reviews = reviewsEl?.children.filter((c) => c.name === 'review') ?? [];
  const ids = new Set<string>();
  let ok = 0;
  reviews.forEach((r, idx) => {
    const before = errors.length;
    const get = (n: string, p: XNode = r) => p.children.find((c) => c.name === n);
    const tag = `review #${idx + 1}${get('review_id') ? ` (${val(get('review_id')!)})` : ''}`;
    const e = (m: string) => err(`${tag}: ${m}`);
    for (const req of REQUIRED_REVIEW) if (!get(req)) e(`missing <${req}>`);

    const id = get('review_id') ? val(get('review_id')!) : '';
    if (id) { if (ids.has(id)) e('duplicate review_id'); ids.add(id); }

    const ts = get('review_timestamp') ? val(get('review_timestamp')!) : '';
    if (ts && !(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(ts) && !Number.isNaN(Date.parse(ts)))) e(`review_timestamp "${ts}" is not ISO 8601`);

    const rn = get('reviewer') ? get('name', get('reviewer')!) : undefined;
    if (get('reviewer') && !rn) e('<reviewer> needs <name>');
    if (rn) {
      const nm = val(rn);
      if (nm.split(/\s+/).length > 1) e(`reviewer name "${nm}" looks like a full name (first name / Anonymous only)`);
      for (const [k, re] of Object.entries(PII)) if (re.test(nm)) e(`PII (${k}) in reviewer name`);
    }

    for (const f of ['content', 'title'] as const) {
      const el = get(f);
      if (!el) continue;
      const raw = val(el);
      if (HTML_LIKE.test(raw)) e(`HTML inside <${f}>`);
      for (const [k, re] of Object.entries(PII)) if (re.test(raw)) e(`PII (${k}) inside <${f}>: "${raw.slice(0, 60)}"`);
    }
    if (get('content') && val(get('content')!).length > 5000) e('content longer than 5000 chars');

    const ru = get('review_url');
    if (ru) {
      if (ru.attrs.type !== 'singleton') e('review_url must have type="singleton"');
      if (!/^https?:\/\//.test(val(ru))) e('review_url must be an absolute URL');
    }

    const overall = get('overall', get('ratings') ?? r);
    if (get('ratings')) {
      if (!overall) e('<ratings> needs <overall>');
      else {
        const n = Number(val(overall));
        if (!(n >= 1 && n <= 5)) e(`overall rating "${val(overall)}" must be 1-5 (never 0)`);
        if (overall.attrs.min !== '1' || overall.attrs.max !== '5') e('overall needs min="1" max="5"');
      }
    }

    const products = get('products');
    const prods = products?.children.filter((c) => c.name === 'product') ?? [];
    if (products && prods.length === 0) e('<products> has no <product>');
    for (const p of prods) {
      const pid = get('product_ids', p);
      if (!pid) { e('MISSING <product_ids>'); continue; }
      const has = (g: string, c: string) => (get(g, pid)?.children.filter((x) => x.name === c && val(x)).length ?? 0) > 0;
      const hasSku = has('skus', 'sku'), hasGtin = has('gtins', 'gtin'), hasMpn = has('mpns', 'mpn'), hasBrand = has('brands', 'brand');
      if (!hasSku && !hasGtin && !(hasMpn && hasBrand)) e('<product_ids> has no usable identifier (need gtin, sku, or mpn+brand)');
      if (hasMpn && !hasBrand) e('<mpns> requires <brands>');
      if (!hasBrand) warnings.push(`${tag}: no <brand> in product_ids`);
      if (!get('product_url', p)) warnings.push(`${tag}: no <product_url>`);
    }
    if (errors.length === before) ok++;
  });
  if (reviews.length === 0) warnings.push('feed contains 0 reviews');
  return { errors, warnings, reviews: reviews.length, ok };
}

// ---------- input ----------
function selfTestFeed(): string {
  const base = { product_id: 'p1', customer_name: 'Priya Sharma', rating: 5, title: 'Great', comment: 'Loved it <br> call 9876543210 priya@x.com', created_at: '2026-05-01T10:00:00Z' };
  const reviews: FeedReview[] = [{ ...base, id: 'a' }, { ...base, id: 'b', customer_name: null, rating: 4 }, { ...base, id: 'c', product_id: 'none' }];
  return buildReviewsFeedXml({
    reviews,
    productsById: new Map([['p1', { id: 'p1', slug: 'red-saree', name: 'Red Saree' }]]),
    skusByProduct: new Map([['p1', ['p1', 'v1-FreeSize']]]),
    brand: 'Sutisaree',
    siteUrl: 'https://www.sutisaree.com',
  }).xml;
}

async function main() {
  const args = process.argv.slice(2);
  let xml: string;
  let source: string;
  if (args.includes('--self-test')) { xml = selfTestFeed(); source = 'self-test (built locally)'; }
  else if (args[0] === '--file') {
    if (!args[1]) { console.error('--file needs a path'); process.exit(2); }
    xml = fs.readFileSync(args[1], 'utf8'); source = args[1];
  } else {
    source = args[0] || 'http://localhost:3000/api/product-reviews-feed';
    const res = await fetch(source);
    if (!res.ok) { console.error(`Fetch failed: HTTP ${res.status}`); process.exit(2); }
    xml = await res.text();
    const skip = res.headers.get('x-reviews-skip-reasons');
    if (skip) console.log(`(server reported skipped reviews: ${skip})`);
  }

  const r = validate(xml);
  console.log(`\nSource: ${source}`);
  console.log(`Reviews found:        ${r.reviews}`);
  console.log(`Reviews fully valid:  ${r.ok}`);
  console.log(`Errors:               ${r.errors.length}`);
  console.log(`Warnings:             ${r.warnings.length}`);
  const show = (label: string, list: string[]) => { if (list.length) { console.log(`\n${label}:`); list.slice(0, 40).forEach((x) => console.log(`  - ${x}`)); if (list.length > 40) console.log(`  ... and ${list.length - 40} more`); } };
  show('ERRORS', r.errors);
  show('WARNINGS', r.warnings);
  console.log(r.errors.length ? '\nRESULT: FAIL' : '\nRESULT: PASS');
  process.exit(r.errors.length ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(2); });
