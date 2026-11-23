// Run: npx tsx scripts/test-product-reviews-feed.ts
// (or: npm run test:reviews-feed)
import {
  sanitizeReviewText,
  sanitizeReviewerName,
  stripHtml,
  buildProductSkus,
  buildReviewsFeedXml,
  type FeedReview,
} from '../lib/product-reviews-feed';

let fail = 0;
let pass = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : `\n   got:    ${JSON.stringify(got)}\n   wanted: ${JSON.stringify(want)}`}`);
};
const t = (name: string, cond: boolean) => eq(name, cond, true);

// ---- e-mails ----
eq('email removed', sanitizeReviewText('Lovely saree, mail me at priya.sharma+test@gmail.com thanks'), 'Lovely saree, mail me at thanks');
eq('email only -> empty', sanitizeReviewText('a_b@x.co.in'), '');
// ---- phones ----
eq('+91 spaced', sanitizeReviewText('call +91 98765 43210 now'), 'call now');
eq('+91 dash', sanitizeReviewText('call +91-98765-43210 now'), 'call now');
eq('91 no plus', sanitizeReviewText('call 919876543210 now'), 'call now');
eq('10 digit', sanitizeReviewText('my number 9876543210 ok'), 'my number ok');
eq('10 digit split', sanitizeReviewText('my number 98765 43210 ok'), 'my number ok');
eq('leading 0', sanitizeReviewText('call 09876543210 ok'), 'call ok');
eq('landline STD', sanitizeReviewText('office 011-2345-6789 ok'), 'office ok');
eq('keeps normal numbers', sanitizeReviewText('Got 5 sarees, 100% happy, paid 2499 rupees'), 'Got 5 sarees, 100% happy, paid 2499 rupees');
// ---- urls / handles ----
eq('https url', sanitizeReviewText('see https://example.com/a?b=1 here'), 'see here');
eq('www url', sanitizeReviewText('see www.example.com/x here'), 'see here');
eq('bare domain', sanitizeReviewText('follow instagram.com/priya_s today'), 'follow today');
eq('@handle', sanitizeReviewText('thanks @priya_saree for help'), 'thanks for help');
// ---- html ----
eq('html tags', sanitizeReviewText('<p>Nice<br />colour</p>'), 'Nice colour');
eq('entity-encoded html', sanitizeReviewText('Nice&lt;br /&gt;colour &amp; fabric'), 'Nice colour & fabric');
eq('script removed', sanitizeReviewText('ok<script>alert(1)</script> fine'), 'ok fine');
t('stripHtml leaves no tag', !/<[a-z]/i.test(stripHtml('a &lt;b&gt;bold&lt;/b&gt; &lt;p&gt;x')));
// ---- misc ----
eq('control chars', sanitizeReviewText('a\u0001b\u000Bc'), 'abc');
eq('whitespace', sanitizeReviewText('  a \n\n  b\t c '), 'a b c');
eq('null', sanitizeReviewText(null), '');
eq('hindi kept', sanitizeReviewText('बहुत सुंदर साड़ी'), 'बहुत सुंदर साड़ी');
eq('maxLength', sanitizeReviewText('word '.repeat(100), 20).length <= 20, true);

// ---- reviewer name ----
eq('full name -> first', sanitizeReviewerName('priya SHARMA'), { name: 'Priya', anonymous: false });
eq('empty -> anonymous', sanitizeReviewerName(''), { name: 'Anonymous', anonymous: true });
eq('null -> anonymous', sanitizeReviewerName(null), { name: 'Anonymous', anonymous: true });
eq('email name -> anonymous', sanitizeReviewerName('priya@gmail.com'), { name: 'Anonymous', anonymous: true });
eq('phone name -> anonymous', sanitizeReviewerName('9876543210'), { name: 'Anonymous', anonymous: true });
eq('single letter -> anonymous', sanitizeReviewerName('P'), { name: 'Anonymous', anonymous: true });
eq('initial+surname', sanitizeReviewerName('A. Kumar'), { name: 'Anonymous', anonymous: true });
eq('hindi name', sanitizeReviewerName('प्रिया शर्मा'), { name: 'प्रिया', anonymous: false });

// ---- skus (must mirror /api/merchant-feed <g:id>) ----
eq('no variants -> product id', buildProductSkus('10445', []), ['10445']);
eq('variant without sizes', buildProductSkus('p1', [{ id: 'v1', product_id: 'p1', product_variant_sizes: [] }]), ['p1', 'v1']);
eq('variant with sizes', buildProductSkus('p1', [{ id: 'v1', product_id: 'p1', product_variant_sizes: [{ size: 'Free Size' }, { size: 'XL' }] }]), ['p1', 'v1-FreeSize', 'v1-XL']);
eq('size truncated to 10', buildProductSkus('p1', [{ id: 'v1', product_id: 'p1', product_variant_sizes: [{ size: 'Extra Large Size' }] }]), ['p1', 'v1-ExtraLarge']);
eq('empty product id -> none', buildProductSkus('  ', undefined), []);
eq('dedupe', buildProductSkus('p1', [{ id: 'p1', product_id: 'p1', product_variant_sizes: [] }]), ['p1']);

// ---- feed build ----
const products = new Map([
  ['p1', { id: 'p1', slug: 'red-saree', name: 'Red <Silk> Saree & more' }],
  ['p2', { id: 'p2', slug: 'blue-saree', name: 'Blue Saree' }],
]);
const skus = new Map([['p1', ['p1', 'v1-FreeSize']], ['p2', []]]);
const base = { product_id: 'p1', customer_name: 'Priya Sharma', rating: 5, title: 'Great', comment: 'Loved it, call 9876543210', created_at: '2026-05-01T10:00:00.123Z' };
const reviews: FeedReview[] = [
  { ...base, id: 'r1' },
  { ...base, id: 'r2', customer_name: null, title: null, comment: '<p>Soft &amp; nice</p>' },
  { ...base, id: 'r3', product_id: 'p2' },                 // no identifier
  { ...base, id: 'r4', product_id: 'nope' },               // unknown product
  { ...base, id: 'r5', rating: 0 },                        // invalid rating (never clamp to 1)
  { ...base, id: 'r6', rating: null },                     // invalid rating
  { ...base, id: 'r7', created_at: 'garbage' },            // invalid date
  { ...base, id: 'r8', title: null, comment: 'a@b.com' },  // empty after PII strip
  { ...base, id: 'r1' },                                   // duplicate id
  { ...base, id: 'r10', title: 'Same', comment: 'same' },  // title == content -> no <title>
];
const res = buildReviewsFeedXml({ reviews, productsById: products, skusByProduct: skus, brand: 'Sutisaree', siteUrl: 'https://www.sutisaree.com/' });
eq('included count', res.included, 3);
eq('skipped reasons', res.skipped, { unknown_product: 1, no_identifier: 1, invalid_rating: 2, invalid_date: 1, empty_content: 1, duplicate_review_id: 1 });
const x = res.xml;
t('timestamp has no millis', x.includes('<review_timestamp>2026-05-01T10:00:00Z</review_timestamp>'));
t('every review has skus + brand', (x.match(/<review>/g) || []).length === (x.match(/<skus><sku>/g) || []).length && (x.match(/<review>/g) || []).length === (x.match(/<brands><brand>Sutisaree<\/brand><\/brands>/g) || []).length);
t('first sku is product id, plus variant sku', x.includes('<skus><sku>p1</sku><sku>v1-FreeSize</sku></skus>'));
t('phone removed from content', !x.includes('9876543210'));
t('full name not emitted', !x.includes('Sharma') && x.includes('<name>Priya</name>'));
t('anonymous flagged', x.includes('<name is_anonymous="true">Anonymous</name>'));
t('no html in content', x.includes('<content>Soft &amp; nice</content>') && !x.includes('&lt;p&gt;'));
t('product name escaped, tags stripped', x.includes('<product_name>Red Saree &amp; more</product_name>'));
t('url has no double slash', x.includes('<review_url type="singleton">https://www.sutisaree.com/product/red-saree</review_url>'));
t('no empty tags', !/<([a-z_]+)(\s[^>]*)?>\s*<\/\1>/.test(x));
t('no <title> when equal to content', !/<title>Same<\/title>/.test(x));
t('no rating 0 anywhere', !/<overall[^>]*>0<\/overall>/.test(x));
t('stable output', buildReviewsFeedXml({ reviews, productsById: products, skusByProduct: skus, brand: 'Sutisaree', siteUrl: 'https://www.sutisaree.com' }).xml === x);

const empty = buildReviewsFeedXml({ reviews: [], productsById: products, skusByProduct: skus, brand: '', siteUrl: 'https://x.com' });
t('empty feed still valid shell', empty.xml.includes('<reviews>') && empty.included === 0);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
