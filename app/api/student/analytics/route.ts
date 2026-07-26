import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@/lib/supabase-server';
import { createClient } from '@supabase/supabase-js';
import { withCache } from '@/lib/cache';
import { CACHE_KEYS, TTL } from '@/lib/redis';
import type { Database } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/student/analytics
 *
 * Returns the calling student's pre-aggregated analytics row from
 * the `student_analytics` materialized view.
 *
 * Caching strategy:
 *   - The materialized view is refreshed hourly by pg_cron.
 *   - We cache the result for the same 1h window (TTL.ANALYTICS),
 *     so the dashboard hits Postgres at most once per student per
 *     hour. A cohort of 1k students opening their dashboard at
 *     09:00 collapses from N reads to 1.
 *   - The cache key includes the user id, so each student gets
 *     their own private entry; invalidation on quiz submit
 *     (POST /api/quiz/submit) makes their own latest result
 *     visible immediately without waiting for the TTL.
 */
export async function GET() {
  const supabase = await createRouteHandlerClient<Database>({ cookies });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const service = serviceRoleClient();

  const analytics = await withCache(
    CACHE_KEYS.studentAnalytics(user.id),
    TTL.ANALYTICS,
    async () => {
      const result = await (
        service as unknown as {
          from: (t: string) => {
            select: (c: string) => {
              eq: (col: string, val: unknown) => {
                single: () => Promise<{ data: unknown }>;
              };
            };
          };
        }
      )
        .from('student_analytics')
        .select('*')
        .eq('student_id', user.id)
        .single();
      return result.data;
    }
  );

  return NextResponse.json({ analytics });
}

function serviceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.'
    );
  }
  return createClient<Database>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
