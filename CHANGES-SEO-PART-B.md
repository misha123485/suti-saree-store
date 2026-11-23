# SEO Part B - spam 410, internal links, blog, checks

Branch `fix/seo-spam-links-blog`. Reviews feed and Product JSON-LD untouched.

## Files
| File | Why |
|---|---|
| data/spam-slugs.ts (new) | The 62 spam slugs (from old-urls-report.csv "post:" rows; the txt reports only print 25). |
| lib/spam-410.ts (new) | Exact + pattern matching (casino, slot, bet, bdm, wazamba, vulkan ...), real routes excluded. |
| middleware.ts | HTTP 410 for spam at /<slug>/ and /blog/<slug>/. Admin/account/vendor/login logic unchanged; other paths pass straight through. |
| lib/blog-api-server.ts | Spam slugs filtered out of blog list/sitemap/post (defense in depth). |
| supabase/migrations/20261124000000_purge_spam_blog_posts.sql | Deletes any spam rows left in blog_posts. |
| spam-urls.txt (new) | 124 absolute URLs (62 root + 62 /blog/) for Search Console > Removals. |
| lib/home-category-links.ts, components/home/home-category-links.tsx, app/page.tsx | Server-rendered home links to 6 categories with keyword anchors; missing categories skipped, never 404. |
| components/product/product-internal-links.tsx, app/product/[slug]/product-page-body.tsx | Visible parent-category link + 4 server-rendered Related products on every product page. |
| data/blog-articles-cotton.ts, scripts/generate-blog-seed-sql.ts, supabase/migrations/20261124010000_seed_cotton_blog_posts.sql | 5 articles (966-1031 words incl. FAQ). Live posts live in the Supabase blog_posts table; lib/blog-data.ts is unused legacy. |
| app/blog/[slug]/page.tsx | {{h3:}} marker; link kinds categoryslug:/tag:/blog: (plain text if target missing); canonical ends with "/"; richer Article JSON-LD (FAQPage already existed). |
| app/blog/page.tsx | Canonical with trailing slash. |
| components/footer.tsx | Blog link (header already had one). |
| app/about/page.tsx, app/contact/page.tsx | Canonicals now match sitemap URLs (/about-us/, /contact-us/). |
| scripts/test-spam-410.ts, check-blog-articles.ts, crawl-check.ts, package.json | npm run test:spam-410, check:blog-articles, generate:blog-seed, crawl:check. |

## Checks run here
- tsc --noEmit 0 errors; test:spam-410 283 passed; check:blog-articles all ok.
- crawl-check tested on a local mock server only (live site not reachable from sandbox).
- NOT run: next build, live 410 test. After deploy:
  `npm run crawl:check -- https://www.sutisaree.com --sitemaps --spam`

## Apply order
1. Run both new SQL migrations in Supabase (purge, then seed). Articles do not exist until the seed runs.
2. Deploy, then run the crawl command.

## Notes
- 2 of the 62 slugs are old "test-post-..." pages; 3 more spam slugs lack the word casino (turbowins, goldenbet, gratorama). All 410.
- Article cover images reuse the 3 existing Pexels photos; replace in Admin > Blog.

## Search Console checklist
1. Sitemaps: re-submit sitemap_index.xml.
2. URL Inspection + Request indexing: cotton-saree, sarees, mulmul-saree, plain-saree category URLs + the 5 new posts.
3. Security & Manual actions: confirm no warnings; if any, request review once 410s are live.
4. Removals > New request: URLs from spam-urls.txt.
5. Pages report: watch Not found (404) fall, Gone (410) rise.
