import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@/lib/supabase-server';
import { z } from 'zod';
import { applyRateLimit, getClientIp } from '@/lib/apply-rate-limit';
import { loginEmailLimiter, loginIpLimiter } from '@/lib/rate-limit';
import type { Database } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// NOTE on path: the user's spec calls for app/(auth)/login/route.ts,
// but Next.js 14 forbids `page.tsx` and `route.ts` in the same
// folder, and the auth (auth) group already owns the /login page.
// This handler lives at /api/auth/login so both can coexist.

// Identical error returned for "wrong password" AND "user not found"
// to prevent enumeration: an attacker can't probe which emails
// exist by watching for different error messages or response sizes.
const GENERIC_AUTH_ERROR = 'Invalid email or password.';

// Length caps stop a multi-megabyte "password" from being hashed by
// the rate limiter or forwarded to the auth service.
const LoginSchema = z.object({
  email: z.string().min(1).max(254),
  password: z.string().min(1).max(1024),
});

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * POST /api/auth/login
 *
 * Server-side credential check. The browser form may call this
 * (instead of supabase.auth.signInWithPassword from the client) to
 * get rate limiting on the server side rather than trusting the
 * client to back off.
 *
 * Flow:
 *   1. Apply the auth limiter (5 attempts per 15 min per IP).
 *      Checked BEFORE we look at the body, so a malformed
 *      brute-force payload still burns its token.
 *   2. Validate payload shape.
 *   3. Call signInWithPassword. Any failure — bad password, no
 *      such user, malformed email, etc. — returns the same 401
 *      with the same generic message.
 */
export async function POST(request: NextRequest) {
  // Per-IP brake first (cheap, before we touch the body), then a
  // per-account limiter once we know which email is being tried.
  const ipLimited = await applyRateLimit(
    request,
    loginIpLimiter,
    `ip:${getClientIp(request) ?? 'anonymous'}`
  );
  if (ipLimited) return ipLimited;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: GENERIC_AUTH_ERROR }, { status: 400 });
  }

  const parsed = LoginSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: GENERIC_AUTH_ERROR }, { status: 400 });
  }
  const payload = parsed.data;

  // Key on a hash of the email so Redis never stores addresses.
  const emailLimited = await applyRateLimit(
    request,
    loginEmailLimiter,
    `email:${await sha256Hex(payload.email.trim().toLowerCase())}`
  );
  if (emailLimited) return emailLimited;

  const supabase = await createRouteHandlerClient<Database>({ cookies });
  const { data, error } = await supabase.auth.signInWithPassword({
    email: payload.email,
    password: payload.password,
  });

  if (error || !data.user) {
    // Identical response shape and status for every failure.
    // Don't include error.message — Supabase's "User not found" vs.
    // "Invalid login credentials" would be an enumeration leak.
    return NextResponse.json({ error: GENERIC_AUTH_ERROR }, { status: 401 });
  }

  // Success — Supabase has set the session cookie via the route
  // handler client. Don't echo profile data here; the client
  // should fetch the profile from a dedicated endpoint so the
  // auth response stays minimal and uniform.
  return NextResponse.json({ ok: true });
}
