# Traffic Analytics — Setup Guide

## Kya kya badla?

| File | Change |
|------|--------|
| `components/admin/analytics-panel.tsx` | Tabs add kiye: **Sales Analytics** + **Traffic** |
| `components/admin/traffic-panel.tsx` | **NEW** — poora Traffic tab UI |
| `app/api/admin/traffic/route.ts` | **NEW** — GA4 Data API backend (last 30 days) |
| `app/api/admin/traffic/realtime/route.ts` | **NEW** — GA4 Realtime API backend |
| `lib/traffic-api.ts` | **NEW** — TypeScript types + fetch helpers |
| `package.json` | `@google-analytics/data` package add kiya |

---

## Traffic Tab mein kya dikhega?

### Summary Cards (top)
- ✅ **GA4 visitors (30d)** — GA4 sirf *known* bots (Googlebot etc.) hataata hai. Data-centre se aane wale headless-Chrome scrapers phir bhi count ho sakte hain, isliye ise "confirmed humans" mat samjho.
- 🤖 **Scraper bots** — GA4 inhe nahi pakadta; Cloudflare > Security > Analytics mein dekho
- 📊 **Sessions, Page Views, Avg Session Duration**
- 👥 **New vs Returning visitors**

### Real-Time Widget
- Live active users count (auto-refresh every 30 seconds)
- Kaun kaunsa page abhi open hai
- Konse country se active hain

### Sub-tabs
1. **Visitor Trend** — 30 days ka line chart
2. **Countries & States** — Top countries + India ke states ka breakdown
3. **Time of Day** — Kaunse time par real visitors aate hain (IST mein)

---

## Vercel pe 2 Environment Variables add karne hain

### Step 1 — GA4 Property ID dhundho

1. analytics.google.com → aapki property kholo
2. Admin (gear icon) → Property Settings
3. **Property ID** copy karo (sirf numbers, jaise `123456789`)

### Step 2 — Service Account banao

1. [console.cloud.google.com](https://console.cloud.google.com) → aapka project
2. **APIs & Services → Credentials**
3. **+ CREATE CREDENTIALS → Service Account**
   - Name: `ga4-reader` (kuch bhi)
   - Click CREATE
4. Naya service account click karo → **KEYS tab** → **ADD KEY → Create new key → JSON**
5. JSON file download hogi

### Step 3 — GA4 mein permission do

1. [analytics.google.com](https://analytics.google.com) → Admin → **Property Access Management**
2. **+ Add users** → service account ki email daalo (file mein `client_email` field)
3. Role: **Viewer** → Add

### Step 4 — Vercel mein add karo

Vercel Dashboard → aapka project → **Settings → Environment Variables**

| Variable Name | Value |
|--------------|-------|
| `GA4_PROPERTY_ID` | `123456789` (aapka property ID) |
| `GA4_SERVICE_ACCOUNT_JSON` | Poora JSON file content (ek line mein paste karo) |

> **Tip:** JSON ko ek line mein karne ke liye: Notepad mein open karo, Ctrl+A, Ctrl+C, phir Vercel mein paste karo. Ya use [jsonformatter.org](https://jsonformatter.org) ka "Minify" button.

---

## npm install kaise karo

Package add hua hai. Deploy karne se pehle local mein:
```bash
npm install
```

Ya Vercel pe deploy karoge to woh khud install kar lega.

---

## Vercel Hobby Plan — Kya possible hai?

| Feature | Possible? |
|---------|-----------|
| GA4 Data API calls (historical data) | ✅ Haan |
| GA4 Realtime API | ✅ Haan |
| Bot filtering | ⚠️ Sirf known bots; scrapers (headless Chrome, data-centre IPs) ghus sakte hain |
| Country/State breakdown | ✅ Haan |
| Real-time active users | ✅ Haan |
| Serverless function timeout | ✅ GA4 API fast hai, 10s se kam |

**Koi Vercel Pro plan ki zaroorat nahi** — GA4 API bilkul alag Google service hai.

---

## Bots ke baare mein (sahi tasveer)

GA4 sirf **IAB ki known-bots list** (Googlebot, Bingbot jaise declared crawlers) filter karta hai. Isliye:
- Jo GA4 mein dikhe wo **100% real humans nahi** hota. Headless Chrome scrapers jo data-centre cities
  (North Bergen, Slough, Hong Kong, Singapore, Santa Clara, Frankfurt) se aate hain, wo GA4 mein bhi ginte hain.
- Pehchaan: device "(not set)", sirf desktop Chrome, 6-9 sec engagement, add-to-cart 0.
- Asli sach ke liye Google Search Console (real clicks) aur Cloudflare Analytics (ASN / User-Agent) dekho.

Agar aap specifically AI bot traffic count chahte hain, to Cloudflare Analytics (free plan mein) zyada detail deta hai.
