// Run: npx tsx scripts/test-feed-description.ts   (or: npm run test:feed-description)
import {
  buildFeedDescription,
  cleanFeedDescription,
  ensureColorMentioned,
  resolveFeedColor,
  FEED_DESCRIPTION_MAX_LENGTH,
} from '../lib/feed-description';

let fail = 0;
let pass = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : `\n   got:    ${JSON.stringify(got)}\n   wanted: ${JSON.stringify(want)}`}`);
};
const t = (name: string, cond: boolean) => eq(name, cond, true);

// ---- cleaning ----
eq('html stripped', cleanFeedDescription('<p>Pure <b>Banarasi</b> silk saree.</p><ul><li>Zari border</li><li>Soft feel</li></ul>'), 'Pure Banarasi silk saree. Zari border. Soft feel.');
eq('entities decoded', cleanFeedDescription('Silk &amp; zari &nbsp;saree'), 'Silk & zari saree.');
eq('entity-encoded html', cleanFeedDescription('&lt;p&gt;Handloom saree&lt;/p&gt;'), 'Handloom saree.');
eq('BEST OFFERS removed', cleanFeedDescription('Beautiful silk saree. BEST OFFERS!!! Soft fabric.'), 'Beautiful silk saree. Soft fabric.');
eq('"This product is already ..." removed', cleanFeedDescription('Silk saree. This product is already discounted, no coupons apply. Rich zari.'), 'Silk saree. Rich zari.');
eq('contact details removed', cleanFeedDescription('Nice saree. Call or WhatsApp 98765 43210 to order. Visit www.example.com today.'), 'Nice saree.');
eq('email removed', cleanFeedDescription('Nice saree. Mail us at shop@example.com.'), 'Nice saree.');
eq('shouting punctuation collapsed', cleanFeedDescription('Lovely saree!!! Pure silk???'), 'Lovely saree. Pure silk.');
eq('decimal numbers survive', cleanFeedDescription('Length 5.5 m with blouse piece 0.8 m.'), 'Length 5.5 m with blouse piece 0.8 m.');
eq('duplicate sentences dropped', cleanFeedDescription('Pure silk. pure silk. Zari work.'), 'Pure silk. Zari work.');
eq('emoji / symbols removed', cleanFeedDescription('Pure silk ✨✔ saree 😍'), 'Pure silk saree.');
eq('generic heading dropped', cleanFeedDescription('<h4>Product Details</h4><p>Pure silk.</p>'), 'Pure silk.');
eq('whitespace collapsed', cleanFeedDescription('  Pure \n\n  silk \t saree  '), 'Pure silk saree.');
eq('null -> ""', cleanFeedDescription(null), '');
eq('only junk -> ""', cleanFeedDescription('BEST OFFERS! Buy now! Hurry!'), '');

// ---- structured sentence from REAL attributes only ----
const full = {
  name: 'Banarasi Silk Saree',
  description: '<p>Beautiful saree for weddings.</p>',
  fabric: 'Pure Silk',
  pattern: 'Woven',
  origin: 'Varanasi',
  occasion: ['Wedding', 'Festive'],
  highlights: {
    ornamentation: 'Zari',
    border: 'Zari Border',
    border_width: 'Big',
    blouse: 'Running blouse piece included',
    length: '5.5 m',
    legacy_specs: [{ label: 'Care', value: 'Dry clean only' }],
  },
};
eq(
  'full record',
  buildFeedDescription(full, 'Red'),
  'Beautiful saree for weddings. Color: Red. Fabric: Pure Silk. Pattern: Woven. Work: Zari. Border: Zari Border (Big). Blouse: Running blouse piece included. Length: 5.5 m. Occasion: Wedding, Festive. Origin: Varanasi. Care: Dry clean only.'
);
// nothing invented
const minimal = buildFeedDescription({ name: 'Plain Saree', description: '' }, 'Blue');
eq('minimal record: name + colour only', minimal, 'Plain Saree. Color: Blue.');
t('no invented attributes', !/Fabric|Length|Blouse|Care|Work|Origin|Occasion/.test(minimal));
eq('missing attributes are skipped', buildFeedDescription({ name: 'X Saree', description: 'A saree.', fabric: 'Cotton' }, 'Green'), 'A saree. Color: Green. Fabric: Cotton.');
eq('placeholder values skipped', buildFeedDescription({ name: 'X Saree', description: 'A saree.', fabric: 'N/A', pattern: 'none' }, 'Green'), 'A saree. Color: Green.');
// no duplicates of what the text already says
eq('attribute already in text is not repeated', buildFeedDescription({ name: 'X', description: 'Red cotton saree with zari.', fabric: 'cotton' }, 'Red'), 'Red cotton saree with zari.');
// ensureColorMentioned behaviour is kept
eq('ensureColorMentioned: appended', ensureColorMentioned('A saree.', 'Red'), 'A saree. Available in Red.');
eq('ensureColorMentioned: already mentioned (case-insens)', ensureColorMentioned('A RED saree.', 'red'), 'A RED saree.');
eq('ensureColorMentioned: empty text', ensureColorMentioned('', 'Red'), 'Available in Red.');
eq('ensureColorMentioned: no colour', ensureColorMentioned('A saree.', ''), 'A saree.');
// limits
const long = buildFeedDescription({ name: 'X', description: 'Soft silk saree. '.repeat(1000), fabric: 'Silk Georgette' }, 'Red');
t('<= 5000 chars', long.length <= FEED_DESCRIPTION_MAX_LENGTH);
t('attributes still present after truncation', /Color: Red\./.test(long) || long.indexOf('Red') !== -1);
t('no HTML ever', !/[<>]/.test(buildFeedDescription({ name: 'X', description: '<script>alert(1)</script><b>ok</b>' }, 'Red')));
t('no XML-illegal control chars', !/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(buildFeedDescription({ name: 'X', description: 'a\u0001b\u0008c' }, 'Red')));

// ---- colour ----
eq('variant colour wins', resolveFeedColor('Maroon', { colors: ['Red'] }), 'Maroon');
eq('falls back to product colours (max 3, "/")', resolveFeedColor('', { colors: ['Red', 'Gold', 'Green', 'Blue'] }), 'Red/Gold/Green');
eq('falls back to all_colors', resolveFeedColor(null, { colors: [], all_colors: ['Teal'] }), 'Teal');
eq('fallback only when nothing at all', resolveFeedColor(null, { colors: [], all_colors: [] }), 'Multicolor');
eq('trims + strips html', resolveFeedColor('  <b>Navy Blue</b> ', {}), 'Navy Blue');
eq('<= 100 chars', resolveFeedColor('x'.repeat(300), {}).length <= 100, true);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
