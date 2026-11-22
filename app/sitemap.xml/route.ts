import { NextResponse } from 'next/server';
import { buildSitemapIndexXml } from '@/lib/sitemap-builder';

// /sitemap.xml may already be submitted in Search Console, so it keeps answering 200,
// but it now serves the SAME index as /sitemap_index.xml (Rank Math structure).
export const revalidate = 3600;

export async function GET() {
  const xml = await buildSitemapIndexXml();
  return new NextResponse(xml, { headers: { 'Content-Type': 'application/xml' } });
}
