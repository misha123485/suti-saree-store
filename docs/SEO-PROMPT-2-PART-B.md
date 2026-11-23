# PROMPT 2 - PART B (Tasks 4-7): Spam 410, internal linking, blog, final checks

Prerequisite: Part A is merged/pushed. Fresh clone https://github.com/misha123485/suti-saree-store/ and create
branch `fix/seo-spam-links-blog` from main. Do NOT change the reviews feed or Product JSON-LD.

CONTEXT: The old WordPress site was hacked: 62 French casino spam posts (BDM, Wazamba, Vulkan Vegas, ...).
They are listed in compare-sitemap-report.txt under "[post] ... NAYE ME NAHI". They must never be served.

TASK 4 - Spam and 410
- Extract ALL 62 slugs from compare-sitemap-report.txt (the report only prints the first 25 per section: if the
  list is truncated, also use old-sitemap-report.txt / old-sitemap-debug.txt) and add them to a data file.
- Make those URLs (and patterns: casino, slot, bet, bdm, wazamba, vulkan, ... under /blog/ or root paths that do
  not exist in this repo) return HTTP 410 Gone, not 404 (middleware.ts matcher + route rules; keep admin/account logic intact).
- Confirm none are in any sitemap and none leak via internal links. Check /blog routes and blog_posts data for leftover spam.
- Write spam-urls.txt (one absolute URL per line) for Search Console > Removals.

TASK 5 - Internal linking
- Home page: server-rendered links to the top 6 categories with keyword anchors ("Cotton Sarees for Women",
  "Mulmul Sarees", "Handloom Sarees", "Sarees Under 500", "Silk Sarees", "Plain Sarees").
- Every product page: a visible link to its parent category + a "Related products" block of 4 products from the
  same category, server rendered, real <a href>.

TASK 6 - Blog
- Write 5 articles (900-1200 words, helpful, original): "How to wear a cotton saree", "Handloom vs mill cotton saree",
  "Cotton saree care guide", "Office wear cotton sarees", "Cotton sarees under 500". Each: title, meta description, slug,
  H2/H3, internal links to categories/products, Article JSON-LD, short FAQ. Add to the sitemap.
  Use the repo's existing blog storage (lib/blog-data.ts / blog_posts table) - check how the 3 current posts are stored first.
- Blog index link in header or footer if missing.

TASK 7 - Final checks
- sitemap_index.xml + child sitemaps: only 200, indexable, canonical URLs. robots.txt allows crawling and lists the sitemap.
- Crawl script over key URLs printing: status, canonical, robots meta, h1 count, title length.

OUTPUT: files changed + reason, spam URL list, written articles, Search Console checklist (re-submit sitemap_index.xml,
URL Inspection + Request indexing for cotton-saree, sarees, mulmul-saree, plain-saree, Security & Manual actions, Removals).
Do not deploy. Commit to the branch and summarize.
