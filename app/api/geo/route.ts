// Tiny edge function: tells the browser which country / state / city it is in,
// using the headers Vercel already adds to every request (100% free, no
// third-party IP API). The browser calls this ONCE per 7 days and caches the
// answer in localStorage (see lib/track-api.ts), so it costs almost nothing.
//
// Locally (npm run dev) these headers don't exist -> all fields are null.

export const runtime = 'edge';

function dec(v: string | null): string | null {
  if (!v) return null;
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}

export async function GET(req: Request) {
  const h = req.headers;
  return new Response(
    JSON.stringify({
      country: dec(h.get('x-vercel-ip-country')),
      region: dec(h.get('x-vercel-ip-country-region')),
      city: dec(h.get('x-vercel-ip-city')),
    }),
    {
      headers: {
        'content-type': 'application/json',
        'cache-control': 'private, no-store',
      },
    }
  );
}
