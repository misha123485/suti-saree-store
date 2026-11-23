# PROMPT 2 - PART A (Tasks 1-3): Category SEO, brand query, tag pages + redirects

You are a senior full-stack and technical SEO engineer. Repo: https://github.com/misha123485/suti-saree-store/
(sutisaree.com, India, sarees; Next.js 14 + Supabase). Fresh clone it. Create a NEW branch
`fix/seo-category-brand-links` from main. Do NOT change the reviews feed or Product JSON-LD.

CONTEXT: Organic traffic fell ~76% since 2025 after the 24 Oct 2026 WordPress -> new stack migration
(same URLs, 301s). cotton-saree category lost the most (5,115 -> 447 clicks; "cotton saree" position 9 -> 42).
Brand query "suti saree" moved from position 2.24 to 3.75. Tag pages lost clicks too (saree-under-1000, saree-under-500).

TASK 1 - Category pages (cotton-saree, sarees, plain-saree, silk-sarees, mulmul-saree)
- VISIBLE <h1> + 2-3 line unique intro ABOVE the grid (page 1 only; /page/N/ must not repeat it).
- Below the grid: buying guide, 4-6 FAQ with FAQPage JSON-LD, links to sub-categories/tags.
- All copy lives in ONE editable data file (lib/category-seo.ts), not in components. Write the real copy.
- Breadcrumb: visible trail and BreadcrumbList schema must come from the SAME array.
- Unique <title> + meta description per category and per paginated page; self-referencing canonical.

TASK 2 - Brand query "suti saree"
- Home <title> starts with "Suti Saree" ("Suti Saree | Pure Cotton, Mulmul & Handloom Sarees Online").
- Organization JSON-LD (name "Suti Saree", alternateName, url, absolute logo, sameAs Instagram/Pinterest/Facebook/YouTube
  read from the repo/admin settings; never invent URLs) + WebSite with SearchAction.
- Exact name "Suti Saree" in og:site_name, footer, schema, title template.

TASK 3 - Tag pages and redirects
- Every tag page: visible h1, unique intro, unique title/description, self canonical, never noindex by mistake.
- Audit the 301s: no chains/loops, destinations 200, canonical and sitemap use final URL only.
  Output a table of all redirects (status + destination).

RULES: commit to the branch, do not deploy. Output: files changed + reason, redirect table, copy written, checklist.
