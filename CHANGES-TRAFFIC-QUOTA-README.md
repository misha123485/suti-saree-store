# Traffic / quota fix (bots se Vercel + Supabase bachao)

## Problem
Bots `/shop/page/14, 16, 17...` ko hazaaron baar hit kar rahe the. `/shop` page `searchParams` padhta hai, isliye
har hit pe Vercel function chalta tha aur Supabase se ye sab padha jaata tha: saare products + variants,
categories, **15,000 activity_events + 5,000 orders** (top-variant map), saari images ke blur previews, 2 settings.
Upar se `/xmlrpc.php`, `/wp-login.php`, `/wp-json/...` jaise purane WordPress probes poora 404 page render karwate the.

## Kya badla (11 files)
| File | Change |
|---|---|
| `lib/shop-data-cache.ts` (NEW) | /shop ka sab data Next Data Cache me: products+categories 5 min, top-variants 1 h, blur 6 h (60-60 ke chunks), settings 5 min |
| `app/shop/page.tsx` | Upar wala cache use karta hai (UI/SEO/JSON-LD same) |
| `next.config.js` | `/shop/:path*` pe `Vercel-CDN-Cache-Control: public, s-maxage=300, stale-while-revalidate=300` (sirf Vercel CDN ke liye; plain Cache-Control Vercel pe override ho jaata hai) -> repeat hits function chalaye bina serve honge |
| `middleware.ts` | WP probes (`xmlrpc.php`, `wp-login.php`, `wp-json`, `wp-admin`, `wp-includes`, plugins/themes) ko turant chhota 404. `/wp-content/uploads` ko CHHUA NAHI (asli images) |
| `app/api/live-viewers/route.ts` | Response 60 sec CDN cache (har browser har 60s poll karta tha) |
| `app/api/admin/products/route.ts`, `products/[id]/route.ts`, `categories/route.ts`, `categories/[id]/route.ts` | Admin save pe `revalidateTag('shop-data')` -> /shop ka cached data turant purge |
| `components/admin/traffic-panel.tsx`, `ANALYTICS-TRAFFIC-README.md` | "GA4 bots filter karta hai / real humans" wala galat text theek kiya |

## Apply (Windows cmd)
```
cd C:\Users\bapan\suti-saree-store
git pull
powershell -Command "Expand-Archive -Path '%USERPROFILE%\Downloads\suti-saree-traffic-fix.zip' -DestinationPath . -Force"
git status
git add -A
git commit -m "Cache /shop data + CDN headers, block WP probes early, fix GA4 bot wording"
git push
```

## Deploy ke baad check
```
curl -I https://www.sutisaree.com/shop/page/5/
curl -I https://www.sutisaree.com/shop/page/5/
curl -I https://www.sutisaree.com/xmlrpc.php
```
- /shop: 2nd call pe `x-vercel-cache: HIT` aur `age:` badhta dikhna chahiye (cache-control private/no-store hi rahega, wo theek hai).
- xmlrpc.php: `404` aur `Not found` text.
- `cf-cache-status: DYNAMIC` normal hai jab tak Cloudflare Cache Rule na bane (alag step).

## Dhyan rakhne wali baatein
- Admin product/category save pe /shop ka *data* turant fresh hota hai; CDN copy ke wajah se worst case ~10 min tak purana dikh sakta hai. Product page par koi farq nahi.
- Settings (page size etc.) badalne pe /shop pe ~5 min lag sakta hai.
- Agar Vercel logs me "Failed to set Next.js data cache ... over 2MB" dikhe to batao (catalog bahut bada ho gaya hoga); page tab bhi chalega, bas us block ka cache nahi banega.
- Kuch bigde to rollback: `git revert HEAD` then `git push`.
