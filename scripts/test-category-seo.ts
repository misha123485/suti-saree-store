/* Offline checks for the category/tag/home SEO copy. Run: npx tsx scripts/test-category-seo.ts */
import {
  CATEGORY_SEO,
  categorySeoTitle,
  categorySeoDescription,
  getCategorySeo,
  hasRichCategoryContent,
} from '../lib/category-seo';
import { buildTagSeo } from '../lib/tag-seo';
import { buildBreadcrumbJsonLd, buildFaqJsonLd, buildOrganizationJsonLd, buildWebSiteJsonLd, cleanSameAs } from '../lib/seo-jsonld';
import { BRAND_NAME, HOME_TITLE, HOME_DESCRIPTION } from '../lib/seo-site';

let fail = 0;
let pass = 0;
function check(cond: boolean, msg: string) {
  if (cond) pass++;
  else {
    fail++;
    console.log('FAIL: ' + msg);
  }
}

const RICH = ['cotton-saree', 'sarees', 'plain-saree', 'silk-sarees', 'mulmul-saree'];
const titles = new Set<string>();
const descs = new Set<string>();
const intros = new Set<string>();

for (const slug of RICH) {
  const c = CATEGORY_SEO[slug];
  check(!!c, `${slug}: has entry`);
  check(hasRichCategoryContent(slug), `${slug}: rich content`);
  const t = categorySeoTitle(slug, slug);
  const d = categorySeoDescription(slug, slug);
  check(t.endsWith(`| ${BRAND_NAME}`), `${slug}: title ends with brand`);
  check(t.length <= 65, `${slug}: title <= 65 chars (is ${t.length}): ${t}`);
  check(d.length >= 100 && d.length <= 160, `${slug}: description 100-160 chars (is ${d.length})`);
  check(!titles.has(t), `${slug}: unique title`);
  check(!descs.has(d), `${slug}: unique description`);
  check(!!c.intro && !intros.has(c.intro), `${slug}: unique intro`);
  titles.add(t); descs.add(d); intros.add(c.intro || '');
  const words = (c.intro || '').split(/\s+/).length;
  check(words >= 35 && words <= 75, `${slug}: intro 35-75 words (is ${words})`);
  check((c.faqs?.length ?? 0) >= 4 && (c.faqs?.length ?? 0) <= 6, `${slug}: 4-6 FAQs`);
  check((c.sections?.length ?? 0) >= 2, `${slug}: >= 2 guide sections`);
  check((c.links?.length ?? 0) >= 5, `${slug}: >= 5 explore links`);
  const faqLd = buildFaqJsonLd(c.faqs || []);
  check(faqLd['@type'] === 'FAQPage' && faqLd.mainEntity.length === (c.faqs || []).length, `${slug}: FAQPage JSON-LD`);
  check(!/Sutisaree/.test(JSON.stringify(c)), `${slug}: no "Sutisaree" spelling in copy`);
}
check(getCategorySeo('silk-sarees-saree') === CATEGORY_SEO['silk-sarees'], 'alias silk-sarees-saree resolves');

// Breadcrumb schema == visible crumbs
const crumbs = [
  { name: 'Home', url: '/' },
  { name: 'Categories', url: '/categories/' },
  { name: 'Cotton Sarees', url: '/product-category/x/cotton-saree/' },
];
const bc = buildBreadcrumbJsonLd(crumbs);
check(bc.itemListElement.length === 3 && bc.itemListElement.map((i) => i.name).join('/') === 'Home/Categories/Cotton Sarees', 'breadcrumb names match visible');
check(bc.itemListElement.every((i) => /^https:\/\//.test(i.item)), 'breadcrumb items absolute');

// Tags
const t1 = buildTagSeo('Saree Under 1000', 'saree-under-1000', 20);
const t2 = buildTagSeo('Saree Under 499', 'saree-under-499', 12);
const t3 = buildTagSeo('Banarasi Silk', 'banarasi-silk', 5);
check(new Set([t1.intro, t2.intro, t3.intro]).size === 3, 'tag intros unique');
check(new Set([t1.title, t2.title, t3.title]).size === 3, 'tag titles unique');
check(new Set([t1.description, t2.description, t3.description]).size === 3, 'tag descriptions unique');
check([t1, t2, t3].every((t) => t.intro.length > 150), 'tag intros are real paragraphs');

// Home
check(HOME_TITLE.startsWith('Suti Saree'), 'home title starts with brand');
check(HOME_TITLE.length <= 65, `home title length ${HOME_TITLE.length}`);
check(HOME_DESCRIPTION.length <= 165, `home description length ${HOME_DESCRIPTION.length}`);
const org = buildOrganizationJsonLd({ logoUrl: '/media/logo.png', sameAs: cleanSameAs(['https://instagram.com/x', '', 'nope', 'https://instagram.com/x']) });
check(org.name === 'Suti Saree', 'org name');
check(/^https:\/\//.test(org.logo), 'org logo absolute');
check(org.sameAs?.length === 1, 'sameAs cleaned + de-duplicated');
check(!('sameAs' in buildOrganizationJsonLd({ logoUrl: '/x.png', sameAs: [] })), 'sameAs omitted when empty (no fake URLs)');
const ws = buildWebSiteJsonLd('x');
check(ws.potentialAction['@type'] === 'SearchAction' && ws.name === 'Suti Saree', 'website SearchAction');

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
