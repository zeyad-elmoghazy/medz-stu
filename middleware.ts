import { NextResponse, type NextRequest } from 'next/server';
import { createMiddlewareSupabase, isDemoMode, type UserRole } from '@/lib/supabase';
import { apiLimiter } from '@/lib/rate-limit';

const PROTECTED_PREFIXES: { prefix: string; role: UserRole }[] = [
  { prefix: '/student', role: 'student' },
  { prefix: '/professor', role: 'professor' },
  { prefix: '/admin', role: 'admin' },
];

const PUBLIC_PATHS = new Set(['/', '/login', '/signup']);

// Rate-limit only these path prefixes. Page navigations are excluded
// because they're mostly served static from Vercel's CDN and the
// meaningful abuse surface is the API layer.
const RATE_LIMITED_PREFIXES = ['/api'];

/**
 * Build a rate-limit identifier.
 *
 * - Authenticated users → `u:<sha256(token)[0..15]>` — accurate per
 *   student on shared NAT (a lecture hall of 200 students no longer
 *   share one bucket).
 * - Anonymous requests → `ip:<addr>` — still throttled so a bot
 *   hammering /api/auth/login can't hide behind "no cookie yet".
 *
 * The Supabase auth cookie is read directly (no @supabase/* runtime
 * needed) so this helper stays cheap. We hash the token instead of
 * using it verbatim so a Redis breach can't be replayed as a
 * session cookie.
 */
async function getRateLimitIdentifier(request: NextRequest): Promise<string> {
  // Supabase v0.8 auth-helpers write cookies named `sb-<ref>-auth-token`.
  // Newer chunked-cookie format uses `.0`, `.1` suffixes; the base
  // cookie is enough to identify the session for rate-limit keying.
  const authCookie = request.cookies.getAll().find((c) =>
    /^sb-.+-auth-token(\.\d+)?$/.test(c.name)
  );

  if (authCookie?.value) {
    const bytes = new TextEncoder().encode(authCookie.value);
    const hash = await crypto.subtle.digest('SHA-256', bytes);
    const hex = Array.from(new Uint8Array(hash))
      .slice(0, 8)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    return `u:${hex}`;
  }

  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'anonymous';
  return `ip:${ip}`;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.match(/\.[a-zA-Z0-9]+$/)
  ) {
    return NextResponse.next();
  }

  // Skip Next.js router prefetches. These fire whenever a <Link>
  // enters the viewport and are not user intent — counting them
  // would burn the Upstash budget on hover-behavior alone.
  const isPrefetch =
    request.headers.get('next-router-prefetch') === '1' ||
    request.headers.get('purpose') === 'prefetch' ||
    request.headers.get('sec-purpose') === 'prefetch';
  if (isPrefetch) {
    return NextResponse.next();
  }

  // Narrow the rate-limit to API traffic. Page navigations are
  // (a) usually cheap static HTML, (b) already protected by
  // per-route limiters on the sensitive endpoints (login, quiz
  // submit, admin ops), and (c) the source of 90%+ of the Redis
  // command volume before this change.
  const shouldRateLimit = RATE_LIMITED_PREFIXES.some((p) =>
    pathname.startsWith(p)
  );

  let rateMeta: {
    success: boolean;
    limit: number;
    remaining: number;
    reset: number;
  } | null = null;

  if (shouldRateLimit && apiLimiter) {
    try {
      const identifier = await getRateLimitIdentifier(request);
      rateMeta = await apiLimiter.limit(identifier);
    } catch (err) {
      // A Redis hiccup shouldn't take down the site — log and
      // proceed without rate limiting for this request.
      console.error('[middleware] rate-limit check failed:', err);
    }

    if (rateMeta && !rateMeta.success) {
      const retryAfter = Math.ceil((rateMeta.reset - Date.now()) / 1000);
      return new NextResponse(
        JSON.stringify({ error: 'Too many requests', retryAfter }),
        {
          status: 429,
          headers: {
            'content-type': 'application/json',
            'X-RateLimit-Limit': rateMeta.limit.toString(),
            'X-RateLimit-Remaining': rateMeta.remaining.toString(),
            'X-RateLimit-Reset': rateMeta.reset.toString(),
            'Retry-After': retryAfter.toString(),
          },
        }
      );
    }
  }

  // Helper to stamp the rate-limit headers onto any response.
  // Frontend can read these and show a "slow down" banner before
  // a user actually trips the 429.
  function withRateHeaders(res: NextResponse): NextResponse {
    if (rateMeta) {
      res.headers.set('X-RateLimit-Limit', rateMeta.limit.toString());
      res.headers.set('X-RateLimit-Remaining', rateMeta.remaining.toString());
      res.headers.set('X-RateLimit-Reset', rateMeta.reset.toString());
    }
    return res;
  }

  // API routes skip auth in the middleware — each route handler
  // owns its own auth check. Just stamp the headers and proceed.
  if (pathname.startsWith('/api')) {
    return withRateHeaders(NextResponse.next());
  }

  // Demo mode bypass: with placeholder Supabase env, let pages
  // handle auth via localStorage instead of calling the
  // (non-existent) backend.
  if (isDemoMode()) {
    return withRateHeaders(NextResponse.next());
  }

  const response = NextResponse.next();
  const supabase = createMiddlewareSupabase(request, response);

  const {
    data: { session },
  } = await supabase.auth.getSession();

  const required = PROTECTED_PREFIXES.find(({ prefix }) =>
    pathname.startsWith(prefix)
  );

  if (!required) {
    if (session && (pathname === '/login' || pathname === '/signup')) {
      const profileQuery = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .single();
      const loginProfile = profileQuery.data as { role: UserRole } | null;
      const role = loginProfile?.role ?? 'student';
      const target = `/${role}/dashboard`;
      return withRateHeaders(NextResponse.redirect(new URL(target, request.url)));
    }
    return withRateHeaders(response);
  }

  if (!session) {
    const redirectUrl = new URL('/login', request.url);
    redirectUrl.searchParams.set('redirectedFrom', pathname);
    return withRateHeaders(NextResponse.redirect(redirectUrl));
  }

  const profileQuery = await supabase
    .from('profiles')
    .select('role')
    .eq('id', session.user.id)
    .single();
  const profile = profileQuery.data as { role: UserRole } | null;

  if (profileQuery.error || !profile?.role) {
    const redirectUrl = new URL('/login', request.url);
    redirectUrl.searchParams.set('error', 'missing_profile');
    return withRateHeaders(NextResponse.redirect(redirectUrl));
  }

  const role = profile.role;

  if (role !== required.role) {
    return withRateHeaders(
      NextResponse.redirect(new URL(`/${role}/dashboard`, request.url))
    );
  }

  if (PUBLIC_PATHS.has(pathname)) {
    return withRateHeaders(response);
  }

  return withRateHeaders(response);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};
