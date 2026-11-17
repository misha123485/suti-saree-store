// app/collection/[slug]/rss.xml/route.ts
//
// Pinterest RSS feed for ONE collection. /collection/[slug] serves two kinds
// of collection (same order as app/api/collection/[slug]/route.ts):
//   1. a vendor's storefront collection (vendors.storefront_slug)
//   2. an admin-curated collection (collections.slug, Admin > Collections)
//
//   https://www.sutisaree.com/collection/<slug>/rss.xml

import { fetchProductsServer } from "@/lib/products-api-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { buildPinterestRss, rssResponse, SITE_URL } from "@/lib/pinterest-feed";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  const products = await fetchProductsServer();

  // 1) Vendor collection -- fetchProductsServer() already attaches p.collection.
  const vendorItems = products.filter((p) => p.collection?.slug === params.slug);
  if (vendorItems.length > 0) {
    const name = vendorItems[0].collection?.name || params.slug;
    const xml = await buildPinterestRss(vendorItems, {
      title: `${name} | Sutisaree`,
      link: `${SITE_URL}/collection/${params.slug}/`,
      description: `${name} from Sutisaree`,
      utmCampaign: `col_${params.slug}`,
    });
    return rssResponse(xml, true);
  }

  // 2) Admin-curated collection.
  const admin = getSupabaseAdmin();
  const { data: collection } = await admin
    .from("collections")
    .select("id, name, slug")
    .eq("slug", params.slug)
    .eq("is_active", true)
    .maybeSingle();
  if (!collection) return new Response("Collection not found", { status: 404 });

  const { data: links } = await admin
    .from("collection_products")
    .select("product_id")
    .eq("collection_id", collection.id)
    .order("position", { ascending: true });

  const byId = new Map(products.map((p) => [p.id, p]));
  const items = (links ?? [])
    .map((l: { product_id: string }) => byId.get(l.product_id))
    .filter((p): p is NonNullable<typeof p> => !!p);

  const xml = await buildPinterestRss(items, {
    title: `${collection.name} | Sutisaree`,
    link: `${SITE_URL}/collection/${collection.slug}/`,
    description: `${collection.name} from Sutisaree`,
    utmCampaign: `col_${collection.slug}`,
  });
  return rssResponse(xml, true);
}
