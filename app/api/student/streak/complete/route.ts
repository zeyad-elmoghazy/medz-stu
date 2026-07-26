import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@/lib/supabase-server';
import type { Database, UserRole } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/student/streak/complete
 *
 * Called after a quiz session is submitted. Increments today's
 * `challenges_completed` count by one, then returns the
 * recomputed streak length.
 *
 * Atomicity note:
 *   The Supabase JS client can't express
 *     SET challenges_completed = challenges_completed + 1
 *   directly through PostgREST. We use a select-then-update
 *   pair scoped to (student_id, streak_date) — a student can't
 *   race themselves through the UI fast enough to overlap, so
 *   we don't pay the cost of an RPC just for the increment. If
 *   you need bulletproof concurrency, replace this with a
 *   dedicated `increment_streak(uuid)` RPC.
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

  type ErrorShape = { message: string } | null;
  const sb = supabase as unknown as {
    from: (table: string) => {
      select: (cols: string) => {
        eq: (col: string, val: unknown) => {
          eq: (col: string, val: unknown) => {
            maybeSingle: () => Promise<{
              data: { challenges_completed: number } | null;
              error: ErrorShape;
            }>;
          };
        };
      };
      update: (patch: Record<string, unknown>) => {
        eq: (col: string, val: unknown) => {
          eq: (col: string, val: unknown) => Promise<{ error: ErrorShape }>;
        };
      };
      insert: (row: Record<string, unknown>) => Promise<{ error: ErrorShape }>;
    };
    rpc: (
      name: string,
      args: Record<string, unknown>
    ) => Promise<{ data: number | null; error: ErrorShape }>;
  };

  const { data: existing, error: selectError } = await sb
    .from('daily_streaks')
    .select('challenges_completed')
    .eq('student_id', user.id)
    .eq('streak_date', today)
    .maybeSingle();

  if (selectError) {
    return NextResponse.json({ error: selectError.message }, { status: 500 });
  }

  if (existing) {
    const { error: updateError } = await sb
      .from('daily_streaks')
      .update({
        challenges_completed: (existing.challenges_completed ?? 0) + 1,
      })
      .eq('student_id', user.id)
      .eq('streak_date', today);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }
  } else {
    const { error: insertError } = await sb.from('daily_streaks').insert({
      student_id: user.id,
      streak_date: today,
      challenges_completed: 1,
    });

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }
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
  const d = new Date();
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${day}`;
}
