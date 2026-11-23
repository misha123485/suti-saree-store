/** npm run test:spam-410 : every spam slug must be 410, real pages must not. */
import { SPAM_SLUGS } from '../data/spam-slugs';
import { isSpamPath, isSpamSlug } from '../lib/spam-410';
import { readFileSync } from 'fs';

// Same coarse pre-filter as the middleware.ts matcher (must match every spam URL).
const matcherSrc = readFileSync('middleware.ts', 'utf8');
const m = matcherSrc.match(/'\/:slug\(\[\^\/\]\*\(\?:([^)]+)\)\[\^\/\]\*\)\/:rest\*'/);
if (!m) throw new Error('root spam matcher not found in middleware.ts');
const pre = new RegExp(`^/[^/]*(?:${m[1]})[^/]*(?:/.*)?$`);

let pass = 0;
let fail = 0;
const ok = (c: boolean, msg: string) => { c ? pass++ : (fail++, console.error('FAIL', msg)); };

ok(SPAM_SLUGS.length === 62 && new Set(SPAM_SLUGS).size === 62, '62 unique slugs');
for (const s of SPAM_SLUGS) {
  ok(isSpamPath(`/${s}/`), `root /${s}/`);
  ok(isSpamPath(`/blog/${s}/`), `/blog/${s}/`);
  ok(isSpamPath(`/blog/${s}/feed/`), `/blog/${s}/feed/`);
  ok(pre.test(`/${s}/`), `matcher prefilter root ${s}`);
}
for (const p of ['/blog/new-casino-slot-bonus/', '/online-casino/', '/best-slots/', '/bdm-casino-x/', '/wazamba-login/', '/vulkan-vegas/', '/betway-offers/', '/blog/ivybet-review/']) {
  ok(isSpamPath(p), `pattern ${p}`);
}
for (const p of [
  '/', '/blog/', '/blog', '/shop/', '/cart/', '/checkout/', '/admin/login/', '/account/orders/', '/login/', '/signup/',
  '/product/black-cotton-saree/', '/category/cotton-saree/', '/tag/saree-under-1000/',
  '/blog/how-to-wear-a-cotton-saree/', '/blog/handloom-vs-mill-cotton-saree/', '/blog/cotton-saree-care-guide/',
  '/blog/office-wear-cotton-sarees/', '/blog/cotton-sarees-under-500/', '/blog/silk-saree-care-tips/',
  '/blog/how-to-wear-a-banarasi-saree/', '/blog/lehenga-vs-saree-for-wedding/', '/about-us/', '/contact-us/',
  '/product-category/clothing/women-clothing/saree/', '/sitemap_index.xml',
]) {
  ok(!isSpamPath(p), `must NOT be spam: ${p}`);
}
ok(!isSpamSlug('better-cotton-guide') && !isSpamSlug('alphabet-print-saree'), 'no false positives on better/alphabet');
console.log(`spam-410 tests: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
