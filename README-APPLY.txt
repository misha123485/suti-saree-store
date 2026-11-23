Is zip me 2 files hain (same path par replace karo):
  next.config.js      -> 9 dead Woo tag URLs par 301 redirect
  app/page.tsx        -> Organization/WebSite schema me alternateName "Suti Saree"

Apply:
  1. Zip extract karo, dono files C:\Users\bapan\suti-saree-store\ me same path par replace karo
  2. node -e "require('./next.config.js').redirects().then(r=>console.log('ok',r.length))"   (ok 38 aana chahiye)
  3. git status   (2 files modified dikhni chahiye)
  4. git add next.config.js app/page.tsx
     git commit -m "301 for dead Woo tags + alternateName Suti Saree"
     git push
  5. Vercel deploy Ready -> Cloudflare Purge Everything
  6. curl -I https://www.sutisaree.com/product-tag/saree-under-500/   (301 aana chahiye)
