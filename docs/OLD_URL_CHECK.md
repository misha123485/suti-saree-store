# Purane WordPress URLs ka check (migration gap)

Problem: kuch purane URLs (jaise /customer-help/) naye site par 404 de rahe hain.

## Kaise chalayein (PowerShell)
```
cd C:\Users\bapan\suti-saree-store
node scripts\check-old-urls.mjs "C:\backup\suti backup\manual backup\oct\3\parm9eAk4Fc4tv.sql"
```
- Script sirf backup padhti hai aur sutisaree.com par GET requests bhejti hai. Kuch badalti nahi.
- Output: `old-urls-report.csv` (status, old_url, type, landed_on). Is file ko Claude ko do, wo redirects bana dega.
- Agar "posts table nahi mila" aaye, to wo file WordPress ka nahi hai (shayad Supabase ka). Zip (3s) ke andar WordPress wala .sql dhundo.
- Git mein `old-urls-report.csv` commit mat karna.
