import { NextRequest, NextResponse } from 'next/server';
import type { Ratelimit } from '@upstash/ratelimit';

/**
 * Apply a rate limiter to an incoming request.
 *
 * Returns:
 *   - `NextResponse` (429) when the caller is over the limit;
 *     route handlers should `return` this value verbatim.
 *   - `null` when the request may proceed.
 *
 * When `limiter` is null (no Upstash credentials configured),
 * every call returns null — rate limiting degrades to a no-op
 * in dev/demo so the routes keep working.
 */
export async function applyRateLimit(
  request: NextRequest,
  limiter: Ratelimit | null,
  identifier?: string // if not provided, uses cookie/IP fallback
): Promise<NextResponse | null> {
  // Limiter not configured — proceed.
  if (!limiter) return null;

  // Identifier resolution order:
  //   1. Explicit user id passed by the caller (post-auth).
  //   2. Hashed Supabase auth cookie (per-session, no supabase-js
  //      needed) — keeps university NATs from starving each other.
  //   3. Raw IP — last-resort for genuinely anonymous requests
  //      (e.g. /api/auth/login before there's a session cookie).
  const id =
    identifier ||
    (await sessionIdentifier(request)) ||
    getClientIp(request) ||
    'anonymous';

  const { success, limit, remaining, reset } = await limiter.limit(id);

  if (!success) {
    const retryAfter = Math.ceil((reset - Date.now()) / 1000);
    return NextResponse.json(
      {
        error: 'Too many requests',
        retryAfter,
      },
      {
        status: 429,
        headers: {
          'X-RateLimit-Limit': limit.toString(),
          'X-RateLimit-Remaining': remaining.toString(),
          'X-RateLimit-Reset': reset.toString(),
          'Retry-After': retryAfter.toString(),
        },
      }
    );
  }

  return null; // null means not rate limited, proceed
}

/**
 * Extract the client IP from forwarding headers.
 *
 * `x-forwarded-for` can be a comma-separated list of hops
 * (`client, proxy1, proxy2`); the leftmost entry is the original
 * client. `x-real-ip` is a single value set by Nginx-style
 * reverse proxies.
 */
function getClientIp(request: NextRequest): string | null {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return request.headers.get('x-real-ip');
}

/**
 * Derive a per-session identifier from the Supabase auth cookie.
 *
 * We SHA-256 the cookie so a Redis breach can't be replayed as a
 * session token. Taking the first 8 bytes (16 hex chars) is plenty
 * of entropy for uniqueness across any realistic user base.
 *
 * Returns null when there's no auth cookie — the caller then falls
 * back to IP.
 */
async function sessionIdentifier(request: NextRequest): Promise<string | null> {
  const authCookie = request.cookies.getAll().find((c) =>
    /^sb-.+-auth-token(\.\d+)?$/.test(c.name)
  );
  if (!authCookie?.value) return null;

  const bytes = new TextEncoder().encode(authCookie.value);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  const hex = Array.from(new Uint8Array(hash))
    .slice(0, 8)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `u:${hex}`;
}
