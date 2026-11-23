// Run: npx tsx scripts/test-product-jsonld.ts   (or: npm run test:product-jsonld)
import { buildProductJsonLd, validateProductJsonLd, type ProductJsonLdInput } from '../lib/product-jsonld';

let fail = 0;
let pass = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : `\n   got:    ${JSON.stringify(got)}\n   wanted: ${JSON.stringify(want)}`}`);
};
const t = (name: string, cond: boolean) => eq(name, cond, true);

const P = '11111111-1111-1111-1111-111111111111';
const V = '22222222-2222-2222-2222-222222222222';
const NOW = new Date('2026-11-24T10:00:00Z');

function base(over: Partial<ProductJsonLdInput> = {}): ProductJsonLdInput {
  return {
    siteUrl: 'https://www.sutisaree.com',
    slug: 'red-banarasi-silk-saree',
    brand: 'Sutisaree',
    displayName: 'Red Banarasi Silk Saree',
    description: '<p>Handwoven <b>silk</b> saree.</p>',
    product: {
      id: P, name: 'Red Banarasi Silk Saree', category: 'Silk Sarees', colors: ['Red'],
      images: ['https://abc.supabase.co/storage/v1/object/public/products/a/1.jpg', 'https://abc.supabase.co/storage/v1/object/public/products/a/2-sm.webp'],
      price: 2499, inStock: true, stock_quantity: 5, fabric: 'Silk', created_at: '2026-01-01T00:00:00Z',
    },
    variant: null,
    reviews: [],
    now: NOW,
    ...over,
  };
}
const ld = (o?: Partial<ProductJsonLdInput>) => buildProductJsonLd(base(o)) as any;
const rev = (rating: number, extra: any = {}) => ({ customer_name: 'Priya Sharma', rating, comment: 'Lovely saree', created_at: '2026-10-01T00:00:00Z', is_approved: true, ...extra });

// ---------- zero reviews -> no aggregateRating / review (IRON RULE) ----------
let x = ld();
t('zero reviews: no aggregateRating key', !('aggregateRating' in x));
t('zero reviews: no review key', !('review' in x));
t('zero reviews: JSON has no "ratingValue"', JSON.stringify(x).indexOf('ratingValue') === -1);
t('reviews=null: still no rating', !('aggregateRating' in ld({ reviews: null })));
t('unapproved review ignored', !('aggregateRating' in ld({ reviews: [rev(5, { is_approved: false })] })));
t('rating 0 ignored (never rounded up)', !('aggregateRating' in ld({ reviews: [rev(0)] })));
t('rating 6 / NaN / null ignored', !('aggregateRating' in ld({ reviews: [rev(6), rev(NaN), rev(null as any)] })));
t('stale product.rating/reviews columns are not used', !('aggregateRating' in ld({ product: { ...base().product, rating: 4.5, reviews: 20 } as any })));

// ---------- 2 reviews -> correct average / count ----------
x = ld({ reviews: [rev(5), rev(4, { customer_name: 'Anita', comment: 'Nice colour', created_at: '2026-10-05T00:00:00Z' })] });
eq('2 reviews: aggregate', x.aggregateRating, { '@type': 'AggregateRating', ratingValue: 4.5, reviewCount: 2, bestRating: 5, worstRating: 1 });
eq('2 reviews: review count', x.review.length, 2);
eq('newest review first', x.review[0].datePublished, '2026-10-05');
eq('review author is first name only', x.review[1].author, { '@type': 'Person', name: 'Priya' });
eq('review rating', x.review[1].reviewRating, { '@type': 'Rating', ratingValue: 5, bestRating: 5, worstRating: 1 });
eq('review body', x.review[1].reviewBody, 'Lovely saree');
eq('3 reviews 5,4,4 -> 4.3', ld({ reviews: [rev(5), rev(4), rev(4)] }).aggregateRating.ratingValue, 4.3);
eq('rating given as string "4"', ld({ reviews: [rev('4' as any)] }).aggregateRating.ratingValue, 4);
// PII / names
x = ld({ reviews: [rev(5, { customer_name: 'a@b.com', comment: 'call 9876543210 <b>great</b>' })] });
eq('email name -> Anonymous', x.review[0].author.name, 'Anonymous');
eq('review body sanitised (phone + html)', x.review[0].reviewBody, 'call great');
x = ld({ reviews: [rev(3, { comment: '', title: 'Okay product' })] });
eq('title used as body when no comment', x.review[0].reviewBody, 'Okay product');
x = ld({ reviews: [rev(3, { comment: '', title: '' })] });
t('star-only review: counted, no reviewBody key', x.aggregateRating.reviewCount === 1 && !('reviewBody' in x.review[0]));
// cap
const many = Array.from({ length: 25 }, (_, i) => rev((i % 5) + 1, { created_at: `2026-09-${String((i % 28) + 1).padStart(2, '0')}T00:00:00Z` }));
x = ld({ reviews: many });
eq('review[] capped at 10', x.review.length, 10);
eq('aggregate still counts all 25', x.aggregateRating.reviewCount, 25);

// ---------- offers ALWAYS present ----------
x = ld();
eq('offer type', x.offers['@type'], 'Offer');
eq('price is a number-string', x.offers.price, '2499.00');
eq('currency', x.offers.priceCurrency, 'INR');
eq('InStock', x.offers.availability, 'https://schema.org/InStock');
eq('priceValidUntil +1y', x.offers.priceValidUntil, '2027-11-24');
eq('validFrom', x.offers.validFrom, '2026-11-24');
eq('condition', x.offers.itemCondition, 'https://schema.org/NewCondition');
eq('offer url', x.offers.url, 'https://www.sutisaree.com/product/red-banarasi-silk-saree');
eq('valid product has no problems', validateProductJsonLd(x), []);
for (const bad of [0, NaN, -5, null, undefined, '' as any, 'abc' as any]) {
  const y = ld({ product: { ...base().product, price: bad as any } });
  t(`price ${String(bad)} -> offers still present`, !!y.offers && y.offers['@type'] === 'Offer');
  eq(`price ${String(bad)} -> OutOfStock (cannot sell at unknown price)`, y.offers.availability, 'https://schema.org/OutOfStock');
  t(`price ${String(bad)} -> reported by validator`, validateProductJsonLd(y).indexOf('invalid_price') !== -1);
}
// ---------- out of stock ----------
eq('product inStock=false -> OutOfStock', ld({ product: { ...base().product, inStock: false } }).offers.availability, 'https://schema.org/OutOfStock');
eq('stock_quantity 0 -> OutOfStock', ld({ product: { ...base().product, stock_quantity: 0 } }).offers.availability, 'https://schema.org/OutOfStock');

// ---------- variants / sizes / sku == feed <g:id> ----------
const variant = {
  id: V, color: 'Maroon', images: ['https://www.sutisaree.com/media/products/v/m1.jpg'], price_override: 2999,
  sizes: [
    { size: 'S/M', stock_quantity: 0, price_override: null },
    { size: 'Free Size', stock_quantity: 3, price_override: 3199 },
  ],
};
x = ld({ variant, slug: 'maroon-banarasi', sizeParam: 'Free Size' });
eq('variant+size sku == feed id', x.sku, `${V}-FreeSize`);
eq('size price override', x.offers.price, '3199.00');
eq('size in stock', x.offers.availability, 'https://schema.org/InStock');
eq('size url', x.offers.url, 'https://www.sutisaree.com/product/maroon-banarasi?size=Free%20Size');
eq('variant colour', x.color, 'Maroon');
eq('variant images used', x.image, ['https://www.sutisaree.com/media/products/v/m1.jpg']);
x = ld({ variant, slug: 'maroon-banarasi' });
eq('no ?size= -> first size sku', x.sku, `${V}-S-M`);
eq('no ?size= -> first size sold out', x.offers.availability, 'https://schema.org/OutOfStock');
eq('no ?size= -> variant price (size has no override)', x.offers.price, '2999.00');
eq('no ?size= -> url without size', x.offers.url, 'https://www.sutisaree.com/product/maroon-banarasi');
eq('unknown ?size= -> falls back to first size', ld({ variant, sizeParam: 'XXL' }).sku, `${V}-S-M`);
eq('variant without sizes -> variant id', ld({ variant: { ...variant, sizes: [] } }).sku, V);
eq('base product -> product id', ld().sku, P);
t('sku valid chars only', /^[A-Za-z0-9._-]{1,50}$/.test(ld({ variant, sizeParam: 'S/M' }).sku));
eq('invalid chars in size sanitised', ld({ variant, sizeParam: 'S/M' }).sku, `${V}-S-M`);
eq('weird product id sanitised', ld({ product: { ...base().product, id: ' ab c/d ' } }).sku, 'ab-c-d');
t('empty product id -> no sku key and validator flags it', !('sku' in ld({ product: { ...base().product, id: '   ' } })) && validateProductJsonLd(ld({ product: { ...base().product, id: '   ' } })).indexOf('invalid_sku') !== -1);

// ---------- other required fields ----------
x = ld();
eq('brand', x.brand, { '@type': 'Brand', name: 'Sutisaree' });
eq('brand from settings', ld({ brand: 'Suti Saree Co' }).brand.name, 'Suti Saree Co');
eq('description has no HTML', x.description, 'Handwoven silk saree.');
eq('empty description -> falls back to name (never empty)', ld({ description: '' }).description, 'Red Banarasi Silk Saree');
eq('description capped', ld({ description: 'word '.repeat(3000) }).description.length <= 5000, true);
eq('images absolute + original (no -sm)', x.image, [
  'https://www.sutisaree.com/media/products/a/1.jpg',
  'https://www.sutisaree.com/media/products/a/2.webp',
]);
t('every image is absolute https', x.image.every((u: string) => /^https:\/\//.test(u)));
t('no thumbnails in image[]', x.image.every((u: string) => !/-(sm|md)\.[a-z]+$/i.test(u)));
t('no images -> key omitted + validator flags it', (() => { const y = ld({ product: { ...base().product, images: [] } }); return !('image' in y) && validateProductJsonLd(y).indexOf('no_image') !== -1; })());
eq('color <= 100 chars', ld({ product: { ...base().product, colors: ['x'.repeat(300)] } }).color.length <= 100, true);
t('no colour -> key omitted', !('color' in ld({ product: { ...base().product, colors: [] } })));
eq('shipping from settings', ld({ shipping: { flat_rate: 49 }, fulfillment: { dispatch_days_min: 1, dispatch_days_max: 2, delivery_metro_min: 3, delivery_remote_max: 5, return_window_days: 7 } }).offers.shippingDetails.shippingRate.value, 49);
eq('return days from settings', ld({ fulfillment: { dispatch_days_min: 1, dispatch_days_max: 2, delivery_metro_min: 3, delivery_remote_max: 5, return_window_days: 7 } }).offers.hasMerchantReturnPolicy.merchantReturnDays, 7);
eq('India defaults when settings absent (shipping)', x.offers.shippingDetails.shippingDestination.addressCountry, 'IN');
eq('India defaults when settings absent (returns)', x.offers.hasMerchantReturnPolicy.merchantReturnDays, 5);
eq('return policy type', x.offers.hasMerchantReturnPolicy['@type'], 'MerchantReturnPolicy');
eq('shipping type', x.offers.shippingDetails['@type'], 'OfferShippingDetails');
t('survives JSON round trip', JSON.stringify(JSON.parse(JSON.stringify(x))) === JSON.stringify(x));
t('no non-schema "slug" key any more', !('slug' in x));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
