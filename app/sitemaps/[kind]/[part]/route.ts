import { NextResponse } from 'next/server';
import { buildSitemapFile, isSitemapKind } from '@/lib/sitemap-builder';

// Internal target of the rewrites in next.config.js:
//   /post-sitemap.xml        -> /sitemaps/post/1
//   /product-sitemap2.xml    -> /sitemaps/product/2   (200 URLs per file, like Rank Math)
export const revalidate = 3600;

export async function GET(_req: Request, { params }: { params: { kind: string; part: string } }) {
  const part = parseInt(params.part, 10);
  if (!isSitemapKind(params.kind) || !Number.isFinite(part) || part < 1) {
    return new NextResponse('Not found', { status: 404 });
  }
  const xml = await buildSitemapFile(params.kind, part);
  if (!xml) return new NextResponse('Not found', { status: 404 });
  return new NextResponse(xml, { headers: { 'Content-Type': 'application/xml' } });
}
