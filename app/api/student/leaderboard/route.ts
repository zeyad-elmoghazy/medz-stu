import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@/lib/supabase-server';
import { createClient } from '@supabase/supabase-js';
import type { Database, LeaderboardRow, UserRole } from '@/lib/supabase';
import { withCache } from '@/lib/cache';
import { CACHE_KEYS, TTL } from '@/lib/redis';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TOP_N = 10;

/**
 * GET /api/student/leaderboard
 *
 * The global XP leaderboard (Part 2.3 of the master doc): top 10
 * students by `profiles.total_xp`, plus the caller's own rank if
 * they're outside the top 10. `total_xp` is maintained
 * incrementally by `record_quiz_result()` (see
 * supabase/migrations/025_leaderboard_xp.sql and
 * app/api/quiz/submit/route.ts) rather than recomputed here, so
 * this route is just two cheap indexed reads behind a short cache.
 */
export async function GET() {
  const supabase = await createRouteHandlerClient<Database>({ cookies });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const profileQuery = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  const profile = profileQuery.data as { role: UserRole } | null;

  if (profile?.role !== 'student') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const service = serviceRoleClient();

  const payload = await withCache(
    CACHE_KEYS.leaderboardGlobal(),
    TTL.LEADERBOARD,
    () => fetchLeaderboard(service)
  );

  // "me" depends on the caller and must never be cached under the
  // shared global key — resolve it fresh against the (possibly
  // cached) top10 every request.
  const me = payload.top10.find((row) => row.id === user.id);
  if (me) {
    return NextResponse.json({ top10: payload.top10, me });
  }

  const rankRes = await service.rpc('get_student_rank', { p_student_id: user.id });
  if (rankRes.error) {
    return NextResponse.json({ error: rankRes.error.message }, { status: 500 });
  }
  const myRow = (rankRes.data as LeaderboardRow[] | null)?.[0] ?? null;

  return NextResponse.json({ top10: payload.top10, me: myRow });
}

async function fetchLeaderboard(service: ServiceRpcClient): Promise<{ top10: LeaderboardRow[] }> {
  const topRes = await service.rpc('get_leaderboard_top', { p_limit: TOP_N });
  if (topRes.error) {
    throw new Error(topRes.error.message);
  }
  return { top10: (topRes.data as LeaderboardRow[] | null) ?? [] };
}

// ============== Service-role client typing ==============
// Same rationale as app/api/quiz/submit/route.ts — the auth-helpers
// client doesn't propagate the Database generic through .rpc().
type ServiceRpcClient = {
  rpc: (
    name: string,
    args: Record<string, unknown>
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
};

function serviceRoleClient(): ServiceRpcClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.'
    );
  }
  return createClient<Database>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  }) as unknown as ServiceRpcClient;
}
