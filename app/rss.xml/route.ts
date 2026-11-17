// app/rss.xml/route.ts
//
// Pinterest-compatible RSS/product feed (ALL products).
// Feed URL: https://www.sutisaree.com/rss.xml
//
// The actual feed building lives in lib/pinterest-feed.ts (shared with the
// per-category / per-tag / per-collection feeds):
//   /category/<slug>/rss.xml
//   /tag/<slug>/rss.xml
//   /collection/<slug>/rss.xml

import { fetchProductsServer } from "@/lib/products-api-server";
import { buildPinterestRss, rssResponse } from "@/lib/pinterest-feed";

export const dynamic = "force-dynamic"; // always fetch fresh data on each request

export async function GET() {
  const products = await fetchProductsServer();
  return rssResponse(await buildPinterestRss(products));
}
