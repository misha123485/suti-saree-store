# SEO Part A - category, brand, tags, redirects

Branch: `fix/seo-category-brand-links`. Reviews feed and Product JSON-LD untouched.

## Files changed / added
| File | Why |
|---|---|
| `lib/seo-site.ts` (new) | One place for brand name "Suti Saree", site URL, home title/description, social fallback (TODO placeholders, empty = omitted). |
| `lib/seo-jsonld.ts` (new) | Pure builders: Breadcrumb, FAQPage, Organization, WebSite(SearchAction), sameAs cleaner. |
| `lib/category-seo.ts` | Editable copy: new `h1`, `intro`, `faqs`, `links` fields; real copy for cotton-saree, sarees, plain-saree, silk-sarees (+ alias silk-sarees-saree), mulmul-saree. Brand now "Suti Saree". |
| `lib/category-links.ts` (new) | Turns link slugs into real hrefs; skips links whose target does not exist or is empty (no 404 / noindex links). |
| `components/category/category-seo-blocks.tsx` (new) | Server-rendered buying guide, FAQ (`<details>`), "Explore more" links. |
| `app/category/[slug]/category-view.tsx` | Visible h1 + intro above grid (page 1 only), guide/FAQ/links below, FAQPage JSON-LD, ONE crumbs array for visible breadcrumb AND schema (Home / Categories / Name), page 2+ gets unique title and description, brand constant. |
| `lib/tag-seo.ts` (new) + `app/tag/[slug]/page.tsx` | Visible h1, unique intro above grid, unique title/description (hand-written for saree-under-1000, ghicha-work; generated unique copy for every other tag, budget-aware), tips + explore links, shared breadcrumb builder. |
| `app/page.tsx` | Home `<title>` fixed in code to start with "Suti Saree"; Organization (absolute logo, sameAs from admin social links, alternateName) + WebSite SearchAction JSON-LD with @id links. |
| `app/layout.tsx`, `components/footer.tsx` | "Suti Saree" in title template, og:site_name, default title, footer name and copyright. |
| `lib/settings-api.ts`, `components/admin/settings-panel.tsx` | New Pinterest field in Admin > Settings > Social Links (feeds sameAs). |
| `lib/seo-redirects.ts` (new) + `lib/sitemap-builder.ts` | Redirected tag slugs are excluded from product_tag sitemap (final URLs only). |
| `scripts/audit-redirects.ts`, `scripts/test-category-seo.ts`, `package.json` | `npm run audit:redirects [-- --live https://www.sutisaree.com]`, `npm run test:category-seo`. |

## Checks run here
- `tsc --noEmit`: 0 errors (baseline also 0).
- `npm run test:category-seo`: 85 passed.
- `npm run audit:redirects`: 38 redirects, no chains/loops (static).

## Redirect table (static audit)
See output of `npm run audit:redirects`. All 301/308 permanent. Key ones:
| Source | Destination |
|---|---|
| /product-tag/saree-under-500 | /product-category/clothing/women-clothing/saree/under-499-saree/ |
| /product-tag/saree-under-1500, /product-tag/under-1500 | /product-tag/saree-under-1000/ |
| /product-tag/summer | .../saree/summer-sarees/ |
| /product-tag/printed, /product-tag/printed-saree | .../saree/printed-saree/ |
| /product-tag/silk-saree, /product-tag/lichi-silk-saree | .../saree/silk-sarees-saree/ |
| /product-tag/ghicha-saree | /product-tag/ghicha-work/ |

## NOT verifiable offline (you must check after deploy)
1. Destinations return 200 and woo_path matches: run `npm run audit:redirects -- --live https://www.sutisaree.com`.
2. The silk category slug in your DB (`silk-sarees` vs `silk-sarees-saree`) - both are covered.
3. Explore links silently skip any category/tag slug that does not exist (see Vercel logs "[category-links] skipped").
4. Social URLs: fill Admin > Settings > Social Links (Instagram, Pinterest, Facebook, YouTube) or the TODOs in `lib/seo-site.ts`. Until then `sameAs` is omitted.
5. Home title: now fixed in code; the admin "SEO title" no longer controls the home page.
