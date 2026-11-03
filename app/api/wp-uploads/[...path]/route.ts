import { NextRequest, NextResponse } from 'next/server';
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import sharp from 'sharp';
import { getR2Client } from '@/lib/storage';

// ---------------------------------------------------------------------
// Serves the old WordPress media library at its ORIGINAL URLs:
//
//   https://www.sutisaree.com/wp-content/uploads/2024/05/photo.jpg
//
// next.config.js rewrites /wp-content/uploads/* to this route, which reads
// the file straight from the Cloudflare R2 bucket (key
// "wp-content/uploads/2024/05/photo.jpg") with the same R2_* credentials the
// rest of the app already uses. No custom domain / public bucket URL needed,
// and every old link (blog posts, product descriptions, Google, backups)
// keeps working unchanged.
//
// Only media-type files are served (never .php etc). Responses are cacheable
// for a long time so Cloudflare / the browser absorb nearly all traffic.
// ---------------------------------------------------------------------

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CONTENT_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  svg: 'image/svg+xml',
  ico: 'image/x-icon',
  bmp: 'image/bmp',
  heic: 'image/heic',
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  mp3: 'audio/mpeg',
  pdf: 'application/pdf',
  xml: 'application/xml',
  txt: 'text/plain; charset=utf-8',
  csv: 'text/csv; charset=utf-8',
};

function decodeSegment(seg: string): string {
  if (!seg.includes('%')) return seg;
  try {
    return decodeURIComponent(seg);
  } catch {
    return seg;
  }
}


// ---------------------------------------------------------------------
// On-demand responsive variants (speed).
//
// The storefront image loader asks for  photo-sm.webp (480px) or
// photo-md.webp (900px)  instead of the full-size photo.png. These files
// don't exist for the old WordPress library, so on the FIRST request we
// create the variant from the original, save it next to the original in
// R2 (never touching the original), and serve it. Every later request is
// a plain R2 read (and CDN-cached). If ANYTHING fails (original missing,
// too big, sharp error) we silently serve the original, so an image is
// never broken.
// ---------------------------------------------------------------------
const VARIANT_WIDTH: Record<string, number> = { sm: 480, md: 900 };
const MAX_ORIGINAL_BYTES = 20 * 1024 * 1024;

function parseVariantKey(key: string): { originalKey: string; width: number; ext: string } | null {
  const m = key.match(/^(.*)-(sm|md)\.(jpe?g|png|webp)$/i);
  if (!m) return null;
  return { originalKey: `${m[1]}.${m[3]}`, width: VARIANT_WIDTH[m[2].toLowerCase()], ext: m[3].toLowerCase() };
}

async function createVariant(bucket: string, key: string): Promise<{ buffer: Buffer; contentType: string } | null> {
  const parsed = parseVariantKey(key);
  if (!parsed) return null;
  try {
    const client = getR2Client();
    const orig = await client.send(new GetObjectCommand({ Bucket: bucket, Key: parsed.originalKey }));
    if (typeof orig.ContentLength === 'number' && orig.ContentLength > MAX_ORIGINAL_BYTES) return null;
    const body = orig.Body as unknown as { transformToByteArray?: () => Promise<Uint8Array> } | undefined;
    if (!body?.transformToByteArray) return null;
    const input = Buffer.from(await body.transformToByteArray());

    let img = sharp(input, { failOn: 'none' })
      .rotate()
      .resize({ width: parsed.width, withoutEnlargement: true });
    let contentType: string;
    if (parsed.ext === 'webp') {
      img = img.webp({ quality: 80 });
      contentType = 'image/webp';
    } else if (parsed.ext === 'png') {
      img = img.png({ compressionLevel: 9, palette: true });
      contentType = 'image/png';
    } else {
      img = img.jpeg({ quality: 80, mozjpeg: true });
      contentType = 'image/jpeg';
    }
    const buffer = await img.toBuffer();

    // Never serve a "variant" that is bigger than the original.
    if (buffer.length >= input.length) return null;

    // Best-effort save so the next request is a plain read.
    try {
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: buffer,
          ContentType: contentType,
          CacheControl: 'public, max-age=31536000, immutable',
        })
      );
    } catch (putErr) {
      console.error('[wp-uploads] could not save variant (serving anyway):', key, putErr);
    }
    return { buffer, contentType };
  } catch (err) {
    console.error('[wp-uploads] variant generation failed, falling back to original:', key, err);
    return null;
  }
}

export async function GET(req: NextRequest, { params }: { params: { path: string[] } }) {
  const segments = (params.path || []).map(decodeSegment);
  if (segments.length === 0 || segments.some((s) => !s || s === '.' || s === '..' || s.includes('\\'))) {
    return new NextResponse('Not found', { status: 404 });
  }

  const key = `wp-content/uploads/${segments.join('/')}`;
  const ext = (segments[segments.length - 1].split('.').pop() || '').toLowerCase();
  const contentType = CONTENT_TYPES[ext];
  if (!contentType) return new NextResponse('Not found', { status: 404 });

  const bucket = process.env.R2_BUCKET_NAME;
  if (!bucket || !process.env.R2_ACCOUNT_ID || !process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY) {
    return new NextResponse('Storage not configured', { status: 503 });
  }

  try {
    const res = await getR2Client().send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
        Range: req.headers.get('range') || undefined,
        IfNoneMatch: req.headers.get('if-none-match') || undefined,
      })
    );

    const headers = new Headers({
      'Content-Type': res.ContentType && !/octet-stream/i.test(res.ContentType) ? res.ContentType : contentType,
      // Old uploads never change in place, so cache hard (browser 30d, CDN 1y).
      'Cache-Control': 'public, max-age=2592000, s-maxage=31536000, stale-while-revalidate=86400',
      'Accept-Ranges': 'bytes',
    });
    if (res.ETag) headers.set('ETag', res.ETag);
    if (res.LastModified) headers.set('Last-Modified', res.LastModified.toUTCString());
    if (typeof res.ContentLength === 'number') headers.set('Content-Length', String(res.ContentLength));
    if (res.ContentRange) headers.set('Content-Range', res.ContentRange);
    if (ext === 'svg') headers.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'");

    const body = res.Body as unknown as { transformToWebStream?: () => ReadableStream } | undefined;
    if (!body?.transformToWebStream) return new NextResponse('Not found', { status: 404 });

    return new NextResponse(body.transformToWebStream(), { status: res.ContentRange ? 206 : 200, headers });
  } catch (err) {
    const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
    const status = e?.$metadata?.httpStatusCode;
    if (status === 304) return new NextResponse(null, { status: 304 });
    if (status === 404 || e?.name === 'NoSuchKey' || e?.name === 'NotFound') {
      // Missing -sm/-md variant? Create it from the original (or fall
      // back to serving the original) instead of returning 404.
      const parsed = parseVariantKey(key);
      if (parsed) {
        const made = await createVariant(bucket, key);
        if (made) {
          return new NextResponse(new Uint8Array(made.buffer), {
            status: 200,
            headers: {
              'Content-Type': made.contentType,
              'Content-Length': String(made.buffer.length),
              'Cache-Control': 'public, max-age=2592000, s-maxage=31536000, stale-while-revalidate=86400',
            },
          });
        }
        // Fallback: redirect to the original (same origin, always exists if the variant could exist).
        return NextResponse.redirect(new URL('/' + parsed.originalKey.split('/').map(encodeURIComponent).join('/'), req.url), 302);
      }
      return new NextResponse('Not found', { status: 404, headers: { 'Cache-Control': 'public, max-age=300' } });
    }
    console.error('[wp-uploads] R2 read failed:', key, err);
    return new NextResponse('Could not load file', { status: 502 });
  }
}
