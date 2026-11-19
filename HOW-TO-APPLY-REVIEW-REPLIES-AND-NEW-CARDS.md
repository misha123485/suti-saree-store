# Review redesign + "Reply from store" + admin toggles

1. Zip ki files apne `suti-saree-store` folder mein usi path par replace/add karo.
2. Supabase SQL Editor mein ye file run karo (ek baar):
   `supabase/migrations/20261119000000_review_replies.sql`
3. Deploy ke baad: Admin -> Reviews -> "Review settings" kholo (saare toggles + date + card look wahin hain).
4. Kisi review par "Reply" dabao -> likho -> "Also email this reply to the customer" tick karo -> Post reply.

Email kise jaata hai: guest_email -> order ka customer_email -> customer ke login ka email (jo pehle mile).
Agar reviewer ka koi email nahi hai to reply save hota hai, bas email nahi jaata (admin ko warning dikhti hai).
