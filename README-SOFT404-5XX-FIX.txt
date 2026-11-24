SOFT 404 + 5xx FIX  (Search Console: Soft 404 = 45, Server error 5xx = 14)

Changed file (sirf 1):
  app/product/[slug]/product-page-body.tsx

Kya badla:
 1. Product/variant na mile to ab notFound() -> asli HTTP 404 (pehle 200 + "Product not found" = Soft 404).
    Ye /product-size/[slug] route par bhi apne aap lagta hai (wo isi file ko use karta hai).
 2. DB call (fetchProductBySlugServer / fetchVariantBySlug) ab 3 baar retry hoti hai,
    taaki Supabase ke chhote timeout se 500 error na jaye.

Apply:
  Zip ko extract karke app\product\[slug]\product-page-body.tsx apne project me replace karo,
  phir:
    git add .
    git commit -m "Real 404 for missing products + retry DB calls"
    git push

Uske baad GSC me Soft 404 aur Server error (5xx) par "Validate Fix" dabao.
