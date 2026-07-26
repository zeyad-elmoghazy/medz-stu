import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@/lib/supabase-server';
import { applyRateLimit } from '@/lib/apply-rate-limit';
import { authLimiter } from '@/lib/rate-limit';
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

type LoginPayload = {
  email?: string;
  password?: string;
};

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
  // IP-based limiter: identifier is left undefined so applyRateLimit
  // pulls it from x-forwarded-for / x-real-ip.
  const limited = await applyRateLimit(request, authLimiter);
  if (limited) return limited;

  let payload: LoginPayload;
  try {
    payload = (await request.json()) as LoginPayload;
  } catch {
    return NextResponse.json({ error: GENERIC_AUTH_ERROR }, { status: 400 });
  }

  if (
    typeof payload.email !== 'string' ||
    typeof payload.password !== 'string' ||
    payload.email.length === 0 ||
    payload.password.length === 0
  ) {
    return NextResponse.json({ error: GENERIC_AUTH_ERROR }, { status: 400 });
  }

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
