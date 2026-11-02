import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { publicDbError } from '@/lib/api-error';
import { applyRateLimit } from '@/lib/apply-rate-limit';
import { usernameCheckLimiter } from '@/lib/rate-limit';
import {
  USERNAME_FORMAT_MESSAGE,
  USERNAME_PATTERN,
  USERNAME_RESERVED_MESSAGE,
  USERNAME_TAKEN_MESSAGE,
  isReservedUsername,
  normalizeUsername,
} from '@/lib/username';
import type { Database } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'private, no-store' };

type Availability =
  | { available: true }
  | { available: false; reason: 'invalid' | 'reserved' | 'taken'; message: string };

/**
 * GET /api/auth/username-available?u=<name>
 *
 * Lets the signup form (no session yet) and the first-login prompt tell a
 * student that a username is free before they submit. It is a convenience
 * only: the database's UNIQUE constraint and the signup trigger decide, so
 * a name that reads "available" here can still lose a race.
 *
 * Public on purpose, so it can be used while signing up. That lets anyone
 * test whether a given name exists, which is not secret on a public
 * leaderboard; the per-IP limiter keeps it from being used to list names.
 * Returns only availability: never ids, names or emails.
 */
export async function GET(request: NextRequest) {
  const limited = await applyRateLimit(request, usernameCheckLimiter);
  if (limited) return limited;

  const raw = request.nextUrl.searchParams.get('u');
  if (raw === null || raw.trim() === '') {
    return NextResponse.json({ error: 'Missing username' }, { status: 400, headers: NO_STORE });
  }

  const username = normalizeUsername(raw);

  // Answer format / reserved without touching the database.
  if (!USERNAME_PATTERN.test(username)) {
    return respond({ available: false, reason: 'invalid', message: USERNAME_FORMAT_MESSAGE });
  }
  if (isReservedUsername(username)) {
    return respond({ available: false, reason: 'reserved', message: USERNAME_RESERVED_MESSAGE });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error('[username-available] Supabase service-role env vars are missing');
    return NextResponse.json(
      { error: 'Username check is unavailable' },
      { status: 500, headers: NO_STORE }
    );
  }

  const service = createClient<Database>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { count, error } = await service
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('username', username);

  if (error) {
    return NextResponse.json(
      { error: publicDbError(error) },
      { status: 500, headers: NO_STORE }
    );
  }

  if ((count ?? 0) > 0) {
    return respond({ available: false, reason: 'taken', message: USERNAME_TAKEN_MESSAGE });
  }
  return respond({ available: true });
}

function respond(body: Availability) {
  return NextResponse.json(body, { headers: NO_STORE });
}
