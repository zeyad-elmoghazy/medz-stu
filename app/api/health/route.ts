import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { redis } from '@/lib/redis';
import { isDemoMode, type Database } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/health
//
// Liveness + readiness in one endpoint.
//   200 = every dependency reachable
//   503 = something's degraded (body still names which one)
//
// Kept intentionally cheap — one round-trip per dependency, no
// business logic — so an uptime prober can hit it every 10s
// without adding measurable load.
export async function GET() {
  const checks: Record<string, 'ok' | 'skipped' | 'error'> = {};

  // Supabase — a bare select from a table that's guaranteed to exist.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (isDemoMode() || !url || !serviceKey) {
    checks.supabase = 'skipped';
  } else {
    try {
      const client = createClient<Database>(url, serviceKey, {
        auth: { persistSession: false },
      });
      const { error } = await client
        .from('profiles')
        .select('id', { head: true, count: 'exact' })
        .limit(1);
      checks.supabase = error ? 'error' : 'ok';
    } catch {
      checks.supabase = 'error';
    }
  }

  // Redis — a single PING through the SET path so we exercise the
  // real write route, not just the SDK.
  if (!redis) {
    checks.redis = 'skipped';
  } else {
    try {
      await redis.set('health:ping', '1', { ex: 10 });
      const value = await redis.get<string>('health:ping');
      checks.redis = value === '1' ? 'ok' : 'error';
    } catch {
      checks.redis = 'error';
    }
  }

  const degraded = Object.values(checks).some((v) => v === 'error');

  return NextResponse.json(
    {
      status: degraded ? 'degraded' : 'healthy',
      timestamp: new Date().toISOString(),
      checks,
    },
    { status: degraded ? 503 : 200 },
  );
}
