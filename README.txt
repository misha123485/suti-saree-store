SAB CHANGES (14 files) - zip ko project folder me extract karke "Replace" karo, phir:
  git add .
  git commit -m "SEO: real 404, redirects, category links, thin-tag noindex"
  git push

1) product-page-body.tsx   : missing product -> real 404, DB retry, category URL pass-through
2) next.config.js          : 301  /blog/page/N/ -> /blog/ ,  /product-tag/x/feed/ -> tag ,  /2026/09/ -> /blog/
3) Category links          : footer, home (Lehenga), product page label, related "view all"
                             ab asli category page par jaate hain (fallback: purana /shop?category=)
                             (lib/category-href.ts, lib/use-category-href.ts - NEW)
4) Filter links nofollow   : shop circles, Filters button, price chips (UI jaisa tha waisa hi)
5) Thin tags               : tag me 3 se kam products -> noindex + sitemap se bahar
                             (lib/tag-index.ts - NEW; number badalna ho to MIN_INDEXABLE_TAG_PRODUCTS)
Koi existing URL/slug change nahi hota.
