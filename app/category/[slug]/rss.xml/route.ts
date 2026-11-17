// app/category/[slug]/rss.xml/route.ts
//
// Pinterest RSS feed for ONE category.
//   https://www.sutisaree.com/category/blouse/rss.xml
//   https://www.sutisaree.com/product-category/sarees/silk-sarees/rss.xml  (old Woo URL, rewritten here)
//
// Same product filter as the category page (productInCategory), so the feed
// always matches what the customer sees on that category page.

import { fetchCategoriesServer, fetchProductsServer } from "@/lib/products-api-server";
import { productInCategory } from "@/lib/category-utils";
import { categoryPath } from "@/lib/category-url";
import { buildPinterestRss, rssResponse, SITE_URL } from "@/lib/pinterest-feed";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  const [categories, products] = await Promise.all([fetchCategoriesServer(), fetchProductsServer()]);
  const category = categories.find((c) => c.slug === params.slug);
  if (!category) return new Response("Category not found", { status: 404 });

  const items = products.filter((p) => productInCategory(p, category.name));
  const xml = await buildPinterestRss(items, {
    title: `${category.name} | Sutisaree`,
    link: `${SITE_URL}${categoryPath(category)}`,
    description: `${category.name} from Sutisaree`,
  });
  return rssResponse(xml, true);
}
