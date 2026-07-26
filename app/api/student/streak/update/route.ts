import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@/lib/supabase-server';
import type { Database, UserRole } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/student/streak/update
 *
 * "Login ping" — make sure today has a row in daily_streaks
 * even if the student doesn't complete a challenge. Without
 * this, the streak function would count a quiet day as a
 * break in the chain.
 *
 * Upsert semantics: ON CONFLICT (student_id, streak_date) DO
 * NOTHING via the Supabase JS client's `ignoreDuplicates: true`.
 * That preserves any existing `challenges_completed` count
 * already accrued for today.
 */
export async function POST() {
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

  // Cast around the auth-helpers-nextjs 0.8 typing limitation
  // (Database generic doesn't propagate into .from() builders).
  const profile = profileQuery.data as { role: UserRole } | null;

  if (profile?.role !== 'student') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const today = todayISODate();

  const sb = supabase as unknown as {
    from: (table: string) => {
      upsert: (
        row: Record<string, unknown>,
        opts?: { onConflict?: string; ignoreDuplicates?: boolean }
      ) => Promise<{ error: { message: string } | null }>;
    };
    rpc: (
      name: string,
      args: Record<string, unknown>
    ) => Promise<{ data: number | null; error: { message: string } | null }>;
  };

  const { error: upsertError } = await sb.from('daily_streaks').upsert(
    {
      student_id: user.id,
      streak_date: today,
      challenges_completed: 0,
    },
    {
      onConflict: 'student_id,streak_date',
      ignoreDuplicates: true,
    }
  );

  if (upsertError) {
    return NextResponse.json({ error: upsertError.message }, { status: 500 });
  }

  const { data: streak, error: streakError } = await sb.rpc(
    'get_student_streak',
    { p_student_id: user.id }
  );

  if (streakError) {
    return NextResponse.json({ error: streakError.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    streak: typeof streak === 'number' ? streak : Number(streak ?? 0),
  });
}

function todayISODate(): string {
  // YYYY-MM-DD in local time. daily_streaks.streak_date is a
  // DATE column so timezone-strip via slice is the safest path.
  const d = new Date();
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${day}`;
}
