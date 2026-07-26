import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@/lib/supabase-server';
import type { Database } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/professor/stats
 *
 * One SQL round-trip via the get_professor_stats(uuid) function
 * declared in 007_professor_authoring.sql. Every number is a
 * live COUNT/AVG at request time — nothing is hardcoded.
 *
 * Cached for 30 s per-user via Cache-Control. Publish/update
 * routes invalidate the Redis mirror explicitly; the browser
 * cache lives 30 s to absorb tab-switch storms.
 */
export async function GET() {
  const supabase = await createRouteHandlerClient<Database>({ cookies });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const profileRes = await supabase
    .from('profiles')
    .select('id, full_name, email, role')
    .eq('id', user.id)
    .single();

  type ProfileSlice = {
    id: string;
    full_name: string | null;
    email: string | null;
    role: 'student' | 'professor' | 'admin';
  };
  const profile = profileRes.data as ProfileSlice | null;

  if (profileRes.error || !profile) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
  }

  if (profile.role !== 'professor' && profile.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const rpc = (supabase as unknown as {
    rpc: (
      name: string,
      args: Record<string, unknown>
    ) => Promise<{ data: unknown; error: { message: string } | null }>;
  }).rpc('get_professor_stats', { p_professor_id: user.id });

  const { data, error } = await rpc;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(
    {
      profile: {
        id: profile.id,
        full_name: profile.full_name,
        email: profile.email,
      },
      stats: data ?? {},
    },
    {
      headers: {
        'Cache-Control': 'private, max-age=30',
      },
    }
  );
}
