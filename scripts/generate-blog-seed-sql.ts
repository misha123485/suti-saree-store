/** npm run generate:blog-seed : writes the migration that inserts/updates the 5 cotton posts in blog_posts. */
import { writeFileSync } from 'fs';
import { COTTON_POSTS } from '../data/blog-articles-cotton';

const q = (t: string) => {
  if (t.includes('$q$')) throw new Error('text contains $q$');
  return `$q$${t}$q$`;
};
const arr = (items: string[]) => `ARRAY[\n    ${items.map(q).join(',\n    ')}\n  ]::text[]`;

const rows = COTTON_POSTS.map(
  (p) => `(
  ${q(p.slug)},
  ${q(p.title)},
  ${q(p.excerpt)},
  ${arr(p.keywords)},
  ${q(p.cover_image)},
  ${arr(p.body)},
  ${q(JSON.stringify(p.faqs))}::jsonb,
  ${p.read_minutes},
  ${q(p.related_category_name)},
  true,
  '${p.published_at}T06:00:00Z',
  now()
)`
).join(',\n');

const sql = `-- 5 cotton saree guides (Task 6). Generated from data/blog-articles-cotton.ts by
-- \`npm run generate:blog-seed\`. Safe to re-run (upserts by slug). Needs the faqs column
-- from 20260921000000_blog_posts_faqs.sql.
INSERT INTO public.blog_posts
  (slug, title, excerpt, keywords, cover_image, body_paragraphs, faqs, read_minutes, related_category_name, published, published_at, updated_at)
VALUES
${rows}
ON CONFLICT (slug) DO UPDATE SET
  title = EXCLUDED.title,
  excerpt = EXCLUDED.excerpt,
  keywords = EXCLUDED.keywords,
  cover_image = EXCLUDED.cover_image,
  body_paragraphs = EXCLUDED.body_paragraphs,
  faqs = EXCLUDED.faqs,
  read_minutes = EXCLUDED.read_minutes,
  related_category_name = EXCLUDED.related_category_name,
  published = true,
  updated_at = now();
`;
writeFileSync('supabase/migrations/20261124010000_seed_cotton_blog_posts.sql', sql);
console.log('wrote migration with', COTTON_POSTS.length, 'posts,', sql.length, 'chars');
