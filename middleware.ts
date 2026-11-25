import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { verifyAdminToken, ADMIN_SESSION_COOKIE } from './lib/admin-auth';
import { isSpamPath, goneResponseHtml } from './lib/spam-410';

// ---------- WordPress scanner probes ----------
// This site used to be WordPress. Bots still hammer /xmlrpc.php, /wp-login.php, /wp-json/... looking for
// holes. None of these exist any more, but without this early exit each one rendered the full 404 page
// (a Vercel function run + layout settings queries). Now they get a tiny plain-text 404 straight from
// middleware. NOTE: /wp-content/uploads/... is NOT listed on purpose -- those are your real images
// (served from R2 via next.config.js rewrites).
const WP_PROBE_RE =
  /^\/(?:xmlrpc\.php|wp-login\.php|wp-cron\.php|wp-config\.php|wp-admin(?:\/|$)|wp-json(?:\/|$)|wp-includes(?:\/|$)|wp-content\/(?:plugins|themes)(?:\/|$))/i;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  if (WP_PROBE_RE.test(pathname)) {
    return new NextResponse('Not found', {
      status: 404,
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'x-robots-tag': 'noindex, nofollow',
        'cache-control': 'public, max-age=0, s-maxage=86400',
      },
    });
  }

  // ---------- Hacked-WordPress spam URLs: 410 Gone (not 404), never served ----------
  // Runs first and only for the spam matcher entries below; non-spam paths that
  // reach this point (e.g. real /blog/ posts) fall straight through.
  if (isSpamPath(pathname)) {
    return new NextResponse(goneResponseHtml(), {
      status: 410,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'x-robots-tag': 'noindex, nofollow',
        'cache-control': 'public, max-age=0, s-maxage=86400',
      },
    });
  }
  if (!pathname.startsWith('/admin') && !pathname.startsWith('/account') && !pathname.startsWith('/vendor') && pathname !== '/login' && pathname !== '/login/' && pathname !== '/signup' && pathname !== '/signup/') {
    return NextResponse.next();
  }

  // ---------- Admin routes: unchanged existing token-based guard ----------
  if (pathname.startsWith('/admin')) {
    if (pathname === '/admin/login' || pathname === '/admin/login/') return NextResponse.next();

    const cookie = req.cookies.get(ADMIN_SESSION_COOKIE);
    const token = cookie?.value ?? null;
    const verified = await verifyAdminToken(token);
    if (verified.valid) return NextResponse.next();

    const loginUrl = new URL('/admin/login', req.url);
    loginUrl.searchParams.set('next', pathname + search);
    return NextResponse.redirect(loginUrl);
  }

  // ---------- Bots / logged-out visitors: skip the Supabase network call ----------
  // Supabase auth cookies start with "sb-". No such cookie = nobody is logged in,
  // so there is nothing to refresh and getUser() would be a wasted round trip.
  const hasAuthCookie = req.cookies.getAll().some((c) => c.name.startsWith('sb-'));
  if (!hasAuthCookie) {
    if (pathname.startsWith('/account') || pathname.startsWith('/vendor')) {
      const loginUrl = new URL('/login', req.url);
      loginUrl.searchParams.set('next', pathname + search);
      return NextResponse.redirect(loginUrl);
    }
    return NextResponse.next();
  }

  // ---------- Customer session refresh (all other routes) ----------
  let response = NextResponse.next({ request: req });

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        cookiesToSet.forEach(({ name, value }) => req.cookies.set(name, value));
        response = NextResponse.next({ request: req });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // ---------- Protect /account and /vendor routes ----------
  if ((pathname.startsWith('/account') || pathname.startsWith('/vendor')) && !user) {
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('next', pathname + search);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: [
    // WordPress scanner probes (see WP_PROBE_RE above)
    '/xmlrpc.php',
    '/wp-login.php',
    '/wp-cron.php',
    '/wp-config.php',
    '/wp-admin/:path*',
    '/wp-json/:path*',
    '/wp-includes/:path*',
    '/wp-content/plugins/:path*',
    '/wp-content/themes/:path*',
    '/admin/:path*',
    '/account/:path*',
    '/vendor/:path*',
    '/login',
    '/signup',
    // Spam 410 (see lib/spam-410.ts, the real decision is made there).
    // 1) anything under /blog/<slug>  2) root-level /<slug> that looks like the old casino spam.
    // The root pattern is a coarse pre-filter so normal pages never run middleware.
    '/blog/:slug/:rest*',
    '/:slug([^/]*(?:casino|slot|bet|bdm|wazamba|vulkan|jackpot|poker|roulette|blackjack|gambling|gransino|gratorama|turbowins|test-post)[^/]*)/:rest*',
  ],
};
