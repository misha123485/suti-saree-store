# Pinterest Product Groups – Setup Guide (Sutisaree)

Feed URL: https://www.sutisaree.com/rss.xml  (file changed: app/rss.xml/route.ts)

## Step 0 – Pehle yeh check karo
Screenshot me "All Products = 0 products" hai, matlab feed abhi ingest nahi hua.
Catalogs > Data sources > feed URL add/refresh karo, status "Processed" hone do (kuch ghante lag sakte hain).
Jab tak products 0 hain, "Create product group" button disabled rahega.

## Custom labels (feed me auto-generate hote hain)
| Label | Values |
|---|---|
| custom_label_0 (price) | price_under_500, price_500_999, price_1000_1999, price_2000_plus |
| custom_label_1 (deal)  | deal_40_plus, deal_20_39, deal_upto_19, regular_price |
| custom_label_2 (occasion) | wedding, festive, party, office_wear, daily_wear |
| custom_label_3 (fabric) | silk, cotton, georgette, banarasi, linen ... |
| custom_label_4 (performance) | top_rated, new_arrival, standard |

## Groups banane ka tareeka
Catalogs > Product groups > Create product group > filter chuno. Har group me
ALWAYS "Availability = in stock" filter lagao.

| # | Group name | Filter |
|---|---|---|
| 1 | Best Sellers - Top Rated | custom_label_4 = top_rated |
| 2 | New Arrivals | custom_label_4 = new_arrival |
| 3 | Big Deals | custom_label_1 = deal_40_plus  OR  deal_20_39 |
| 4 | Under 500 | custom_label_0 = price_under_500 |
| 5 | 500 to 999 | custom_label_0 = price_500_999 |
| 6 | 1000 to 1999 | custom_label_0 = price_1000_1999 |
| 7 | Premium 2000+ | custom_label_0 = price_2000_plus |
| 8 | Wedding Sarees | custom_label_2 = wedding |
| 9 | Festive & Party | custom_label_2 = festive OR party |
| 10 | Silk Sarees | custom_label_3 = silk OR banarasi |
| 11 | Cotton Sarees | custom_label_3 = cotton |

Tip: Pehle 5-6 groups se shuru karo (1,2,3,4,5,8). Har group me kam se kam ~20 in-stock products hone chahiye.
Product groups overlap karte hain (ek product kai groups me aa sakta hai) – ads me ek hi product 2 groups me
promote karoge to apna hi budget khaoge. Ads ke liye ya to PRICE groups (4-7) ya OCCASION groups (8-9) use karo, dono ek saath nahi.

## Ads strategy (impressions + clicks + conversion)
- Campaign type: Shopping, objective = Conversions (checkout) ya Consideration (clicks) pehle 2 hafte.
- Pehle Best Sellers, Big Deals, Under 500, Wedding Sarees pe chalao.
- Targeting: India, Female 22-50, interests: saree, ethnic wear, wedding fashion, festive outfits.
- Daily budget: har ad group pe chhota (Rs 200-300) rakho, 7 din baad low CTR wale band karo.
- Pinterest Tag + Conversions API (checkout event) install hona zaroori hai conversion optimisation ke liye.

## Policy safe rehne ke liye
- Titles/descriptions me "sale", "free shipping", "% off", emoji, ALL CAPS nahi aayenge (feed khud saaf karta hai).
- Sale price sirf tab jab asli MRP > selling price ho (misleading discount nahi).
- Feed price = landing page price (size/colour wise), ?size= link already hai.
- Landing page par Return/Refund, Shipping, Contact policies visible honi chahiye (aapki site me hain).
- Product images clear, bina text-overlay/watermark/promo banner ke hon.
