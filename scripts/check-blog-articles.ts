/** npm run check:blog-articles : word counts, meta length, forbidden patterns for the 5 cotton posts. */
import { COTTON_POSTS } from '../data/blog-articles-cotton';
import { isSpamSlug } from '../lib/spam-410';

const strip = (s: string) => s.replace(/\{\{(?:h2|h3):([^}]+)\}\}/g, '$1').replace(/\{\{product:[^}]+\}\}/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
let bad = 0;
for (const p of COTTON_POSTS) {
  const body = p.body.map(strip).join(' ');
  const faq = p.faqs.map((f) => `${f.question} ${f.answer}`).join(' ');
  const wc = (t: string) => t.split(/\s+/).filter(Boolean).length;
  const total = wc(body) + wc(faq);
  const h2 = p.body.filter((x) => x.startsWith('{{h2:')).length;
  const h3 = p.body.filter((x) => x.startsWith('{{h3:')).length;
  const links = p.body.join(' ').match(/\]\((categoryslug|tag|blog):/g)?.length ?? 0;
  const prods = p.body.filter((x) => x.startsWith('{{product:')).length;
  const issues: string[] = [];
  if (total < 900 || total > 1200) issues.push(`words ${total} outside 900-1200`);
  if (p.excerpt.length > 160) issues.push(`meta ${p.excerpt.length} > 160`);
  if (isSpamSlug(p.slug)) issues.push('slug trips spam filter');
  if (links < 4) issues.push('fewer than 4 internal links');
  if (prods < 1) issues.push('no product card');
  if (p.faqs.length < 3) issues.push('faq < 3');
  console.log(`${issues.length ? 'FAIL' : 'ok  '} ${p.slug}: ${total} words (body ${wc(body)}, faq ${wc(faq)}), meta ${p.excerpt.length}, h2=${h2} h3=${h3}, links=${links}, products=${prods}`, issues.join('; '));
  if (issues.length) bad++;
}
process.exit(bad ? 1 : 0);
