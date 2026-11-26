CATEGORY + TAG PAGE REDESIGN (v2)  -- product page / cart / shop me koi change nahi

Files (zip ke andar wahi folder structure hai, apne project me replace karo / add karo):
  components/category/category-toolbar-grid.tsx   (sticky full-width Filters bar, filter+sort sheet, pincode, full-width grid, WhatsApp/Google badge neeche)
  components/category/back-button.tsx             (NAYI file - title ke aage back arrow)
  app/category/[slug]/category-view.tsx           (back button, description products ke neeche)
  app/tag/[slug]/page.tsx                         (back button, description products ke neeche)
  components/reviews-badge.tsx                    (sirf z-index: Reviews tab ab filter bar ke upar dikhta hai)

Apply:
  zip extract karke files replace karo, phir
    git add .
    git commit -m "Category/tag pages: sticky filters, pincode, full width, back button"
    git push
