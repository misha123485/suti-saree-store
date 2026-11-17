// app/tag/[slug]/rss.xml/route.ts
//
// Pinterest RSS feed for ONE tag.
//   https://www.sutisaree.com/tag/<slug>/rss.xml
//   https://www.sutisaree.com/product-tag/<slug>/rss.xml  (old Woo URL, rewritten here)

import {
  fetchProductsServer,
  fetchTagBySlugServer,
  fetchTagProductIdsServer,
} from "@/lib/products-api-server";
import { buildPinterestRss, rssResponse, SITE_URL } from "@/lib/pinterest-feed";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  const tag = await fetchTagBySlugServer(params.slug);
  if (!tag) return new Response("Tag not found", { status: 404 });

  const [products, ids] = await Promise.all([fetchProductsServer(), fetchTagProductIdsServer(tag.id)]);
  const idSet = new Set(ids);
  const items = products.filter((p) => idSet.has(p.id));

  const xml = await buildPinterestRss(items, {
    title: `${tag.name} | Sutisaree`,
    link: `${SITE_URL}/product-tag/${tag.slug}/`,
    description: `${tag.name} from Sutisaree`,
    utmCampaign: `tag_${tag.slug}`,
  });
  return rssResponse(xml, true);
}
