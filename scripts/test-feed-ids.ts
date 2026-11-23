// Run: npx tsx scripts/test-feed-ids.ts   (or: npm run test:feed-ids)
import { feedOfferId, sanitizeSku, sizeIdPart, findDuplicateIds, skuProblem } from '../lib/feed-ids';
import { buildProductSkus } from '../lib/product-reviews-feed';
import { feedMatchedItemId } from '../lib/gtag-track';
import { toFeedImageUrl, toFeedImageUrls, toOriginalImageUrl, isThumbnailUrl } from '../lib/feed-images';

let fail = 0;
let pass = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : `\n   got:    ${JSON.stringify(got)}\n   wanted: ${JSON.stringify(want)}`}`);
};

const P = '11111111-1111-1111-1111-111111111111';
const V = '22222222-2222-2222-2222-222222222222';

// ---- same values the ORIGINAL inline feed code produced (nothing that was valid may change) ----
eq('product without variants -> product id', feedOfferId({ productId: P }), P);
eq('variant without sizes -> variant id', feedOfferId({ productId: P, variantId: V }), V);
eq('variant + size', feedOfferId({ productId: P, variantId: V, size: 'XL' }), `${V}-XL`);
eq('size whitespace removed', feedOfferId({ productId: P, variantId: V, size: 'Free Size' }), `${V}-FreeSize`);
eq('size capped at 10 chars', feedOfferId({ productId: P, variantId: V, size: 'Extra Large Plus' }), `${V}-ExtraLarge`);
eq('size part helper', sizeIdPart(' 5.5 m '), '5.5m');

// ---- new: sanitising ----
eq('invalid chars replaced', feedOfferId({ productId: P, variantId: V, size: 'S/M' }), `${V}-S-M`);
eq('slash/space/unicode sanitised', sanitizeSku(' ab c/d₹ '), 'ab-c-d-');
eq('max 50', sanitizeSku('a'.repeat(80)).length, 50);
eq('empty -> ""', sanitizeSku('   '), '');
eq('only separators -> ""', sanitizeSku('---'), '');
eq('non-string -> ""', sanitizeSku({ a: 1 }), '');
eq('number ok', sanitizeSku(1234), '1234');
eq('empty variant id falls back to product id', feedOfferId({ productId: P, variantId: '  ' }), P);
eq('total length of a real id <= 50', feedOfferId({ productId: P, variantId: V, size: 'XXXXXXXXXXXXXXX' }).length <= 50, true);

// ---- duplicates / DB sku problems ----
eq('duplicates found', findDuplicateIds(['a', 'b', 'a', 'c', 'a']), ['a']);
eq('no duplicates', findDuplicateIds(['a', 'b']), []);
eq('skuProblem empty', skuProblem(''), 'empty');
eq('skuProblem null', skuProblem(null), 'empty');
eq('skuProblem non string', skuProblem(12), 'not_a_string');
eq('skuProblem invalid chars', skuProblem('AB 12/3'), 'invalid_characters');
eq('skuProblem too long', skuProblem('a'.repeat(51)), 'longer_than_50');
eq('skuProblem ok', skuProblem('SKU-1.a_b'), null);

// ---- all consumers agree (feed <g:id> == JSON-LD sku == reviews <sku> == gtag item id) ----
const variants = [
  { id: V, product_id: P, product_variant_sizes: [{ size: 'S/M' }, { size: 'Free Size' }] },
  { id: '33333333-3333-3333-3333-333333333333', product_id: P, product_variant_sizes: [] },
];
const skus = buildProductSkus(P, variants);
eq('reviews skus = product id + every feed id', skus, [
  P,
  `${V}-S-M`,
  `${V}-FreeSize`,
  '33333333-3333-3333-3333-333333333333',
]);
eq('gtag id == feed id (size)', feedMatchedItemId(P, { id: V, sizes: [1] }, 'S/M'), `${V}-S-M`);
eq('gtag id == feed id (no sizes)', feedMatchedItemId(P, { id: V, sizes: [] }, 'S/M'), V);
eq('gtag id == feed id (no variant)', feedMatchedItemId(P, null, null), P);

// ---- images ----
eq('thumbnail detected', isThumbnailUrl('https://x.com/media/a/photo-sm.webp'), true);
eq('thumbnail md with query', toOriginalImageUrl('https://x.com/media/a/photo-md.jpg?v=2'), 'https://x.com/media/a/photo.jpg?v=2');
eq('original untouched', toOriginalImageUrl('https://x.com/media/a/photo.jpg'), 'https://x.com/media/a/photo.jpg');
eq('name with -sm- inside is untouched', toOriginalImageUrl('https://x.com/media/a/photo-small.jpg'), 'https://x.com/media/a/photo-small.jpg');
eq('relative /media made absolute', toFeedImageUrl('/media/a/b.jpg', 'https://www.sutisaree.com'), 'https://www.sutisaree.com/media/a/b.jpg');
eq('supabase url rewritten + original', toFeedImageUrl('https://abc.supabase.co/storage/v1/object/public/products/a/b-sm.webp', 'https://www.sutisaree.com'), 'https://www.sutisaree.com/media/products/a/b.webp');
eq('non-http dropped', toFeedImageUrl('javascript:alert(1)', 'https://www.sutisaree.com'), null);
eq('empty dropped', toFeedImageUrl('  ', 'https://www.sutisaree.com'), null);
eq('dedupe after thumbnail mapping', toFeedImageUrls(['https://x.com/a-sm.jpg', 'https://x.com/a.jpg', null, ''], 'https://x.com'), ['https://x.com/a.jpg']);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
