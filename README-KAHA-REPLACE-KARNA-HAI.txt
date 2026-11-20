MOBILE CHECKOUT PROGRESS CAPSULE (Contact / Address / Delivery / Payment)

Is zip me 2 files hain. Zip ko suti-saree-store folder me extract karo (Replace all):

1) app/checkout/page.tsx                          -> REPLACE (purani file badal jayegi)
2) components/checkout/checkout-steps-bar.tsx     -> NEW file

Ye zip last commit 0499389 ("Order summary collapsible, coupons and offers card...")
ke upar bana hai. Agar uske baad page.tsx me aapne kuch aur badla ho to wo overwrite ho jayega.

Fir:
  git add .
  git commit -m "Mobile sticky clickable checkout progress capsule"
  git push

Kya milega (sirf mobile, md se upar hide):
- "You're saving" bar ke neeche capsule, header ke neeche sticky
- Step pe tap karo to us section pe smooth scroll
- Scroll ke saath current step maroon pill me
- Step tab hi green + tick hota hai jab uski details sach me bhar jayein
- Chhote (320px) aur bade sab phones pe fit, desktop ka purana progress waisa hi
