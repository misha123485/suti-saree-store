import { NextResponse } from 'next/server';
import { buildSitemapIndexXml } from '@/lib/sitemap-builder';

// Rank Math style index: /sitemap_index.xml -> post-sitemap.xml, page-sitemap.xml,
// product-sitemap.xml, product-sitemap2.xml, product_cat-sitemap.xml, product_tag-sitemap.xml
export const revalidate = 3600;

export async function GET() {
  const xml = await buildSitemapIndexXml();
  return new NextResponse(xml, { headers: { 'Content-Type': 'application/xml' } });
}
