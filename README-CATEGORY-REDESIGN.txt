CATEGORY + TAG PAGE REDESIGN  (sirf category aur tag pages; product page/cart/shop me koi change nahi)

Files (zip ke andar wahi folder structure hai, apne project me replace karo):
  components/category/category-toolbar-grid.tsx   (naya sticky Filters/Sort bar, filter sheet, sort sheet, pincode)
  app/category/[slug]/category-view.tsx           (description ab products ke NEECHE)
  app/tag/[slug]/page.tsx                         (description ab products ke NEECHE)

Pincode: product page wali hi localStorage key (aruhi_delivery_pincode) use hoti hai,
isliye category me save kiya pincode product page par bhi apne aap dikhega.

Apply:
  zip extract karke 3 files replace karo, phir
    git add .
    git commit -m "Category/tag pages: sticky filters, pincode, description below products"
    git push
