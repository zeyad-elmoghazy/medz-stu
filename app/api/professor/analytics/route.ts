import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@/lib/supabase-server';
import type { Database } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/professor/analytics
 *
 * Aggregates for the Analytics view. All numbers derived from
 * quiz_sessions filtered by the subjects this professor owns.
 * No hardcoded fallbacks — an empty DB returns [].
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
    .select('role')
    .eq('id', user.id)
    .single();

  const role = (profileRes.data as { role: string } | null)?.role;
  if (role !== 'professor' && role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // 1) subjects this professor owns
  const modulesRes = await (supabase as unknown as {
    from: (t: string) => {
      select: (c: string) => {
        eq: (c: string, v: unknown) => Promise<{
          data: { subject_id: string }[] | null;
          error: { message: string } | null;
        }>;
      };
    };
  })
    .from('modules')
    .select('subject_id')
    .eq('professor_id', user.id);

  const subjectIds = Array.from(
    new Set((modulesRes.data ?? []).map((r) => r.subject_id))
  );

  if (subjectIds.length === 0) {
    return NextResponse.json({
      accuracy_over_time: [],
      subject_breakdown: [],
      hardest_questions: [],
    });
  }

  // 2) accuracy over last 30 days, bucketed per day.
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();

  const sessionsRes = await (supabase as unknown as {
    from: (t: string) => {
      select: (c: string) => {
        in: (c: string, v: string[]) => {
          gte: (c: string, v: string) => {
            order: (c: string, o: { ascending: boolean }) => Promise<{
              data:
                | {
                    subject_id: string;
                    accuracy: number;
                    completed_at: string;
                    student_id: string;
                  }[]
                | null;
              error: { message: string } | null;
            }>;
          };
        };
      };
    };
  })
    .from('quiz_sessions')
    .select('subject_id, accuracy, completed_at, student_id')
    .in('subject_id', subjectIds)
    .gte('completed_at', thirtyDaysAgo)
    .order('completed_at', { ascending: true });

  const sessions = sessionsRes.data ?? [];

  // Bucket per day (YYYY-MM-DD) → { date, count, avg_accuracy }
  const buckets = new Map<string, { total: number; count: number }>();
  for (const s of sessions) {
    const day = s.completed_at.slice(0, 10);
    const b = buckets.get(day) ?? { total: 0, count: 0 };
    b.total += Number(s.accuracy);
    b.count += 1;
    buckets.set(day, b);
  }
  const accuracy_over_time = Array.from(buckets.entries()).map(
    ([date, { total, count }]) => ({
      date,
      accuracy: count ? Math.round((total / count) * 10) / 10 : 0,
      sessions: count,
    })
  );

  // Subject breakdown
  const subjectMap = new Map<
    string,
    { students: Set<string>; total: number; count: number }
  >();
  for (const s of sessions) {
    const entry = subjectMap.get(s.subject_id) ?? {
      students: new Set<string>(),
      total: 0,
      count: 0,
    };
    entry.students.add(s.student_id);
    entry.total += Number(s.accuracy);
    entry.count += 1;
    subjectMap.set(s.subject_id, entry);
  }
  const subject_breakdown = Array.from(subjectMap.entries()).map(
    ([subject_id, { students, total, count }]) => ({
      subject_id,
      unique_students: students.size,
      avg_accuracy: count ? Math.round((total / count) * 10) / 10 : 0,
      total_attempts: count,
    })
  );

  // Hardest questions — the ones with the most quiz-session
  // rows where the answer was wrong. Cheapest reasonable approach:
  // pull this prof's published questions + their session answer
  // records aren't queried in bulk here (would be heavy) —
  // instead, we return the questions with the highest flag_count
  // and let the professor drill in. For a v2, wire per-question
  // correctness stats.
  const hardestRes = await (supabase as unknown as {
    from: (t: string) => {
      select: (c: string) => {
        eq: (c: string, v: unknown) => {
          order: (c: string, o: { ascending: boolean }) => {
            limit: (n: number) => Promise<{
              data:
                | {
                    id: number;
                    question: string;
                    chapter_id: string | null;
                    flag_count: number;
                  }[]
                | null;
              error: { message: string } | null;
            }>;
          };
        };
      };
    };
  })
    .from('questions')
    .select('id, question, chapter_id, flag_count')
    .eq('professor_id', user.id)
    .order('flag_count', { ascending: false })
    .limit(5);

  return NextResponse.json({
    accuracy_over_time,
    subject_breakdown,
    hardest_questions: hardestRes.data ?? [],
  });
}
