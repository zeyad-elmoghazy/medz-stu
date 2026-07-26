import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@/lib/supabase-server';
import { createClient } from '@supabase/supabase-js';
import type { Database, UserRole } from '@/lib/supabase';
import { SUBJECTS_CONFIG } from '@/lib/dashboard-data';
import type {
  StudentRecord,
  SubjectBreakdown,
} from '@/lib/professor-types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ProfileRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  created_at: string;
};

type SubjectStatRow = {
  student_id: string;
  subject_id: string;
  total_sessions: number | null;
  total_correct: number | null;
  total_answered: number | null;
  avg_accuracy: number | null;
  last_attempted: string | null;
};

/**
 * GET /api/professor/students
 *
 * Returns every student's roster row plus their aggregated
 * performance. Auth: cookie session → must be `professor`. Data
 * pulls happen on the service-role client so they bypass RLS
 * (which otherwise hides other students' rows).
 *
 * Cost shape:
 *   - 1 profiles query (sorted by full_name)
 *   - 1 student_subject_stats query for ALL students at once
 *     (filtered by `student_id IN (...)`)
 *   - N `get_student_streak()` RPC calls in parallel
 *
 * For a cohort of ~1k students this is one big query + one
 * IN-list query + ~1k tiny RPC calls. The streak loop is the
 * one to optimize next (batch RPC or a streak view).
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
  if (profile?.role !== 'professor') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const service = serviceRoleClient();

  // 1) Roster.
  const { data: profilesData, error: profilesError } = await service
    .from('profiles')
    .select('id, full_name, email, created_at')
    .eq('role', 'student')
    .order('full_name', { ascending: true });

  if (profilesError) {
    return NextResponse.json({ error: profilesError.message }, { status: 500 });
  }

  const students = (profilesData ?? []) as ProfileRow[];

  if (students.length === 0) {
    return NextResponse.json({ students: [] });
  }

  const studentIds = students.map((s) => s.id);

  // 2 + 3 in parallel. The subject-stats scan and the N streak RPCs
  // are independent — running them concurrently cuts wall time to
  // max(scan, streaks) instead of scan + streaks. Under Postgres
  // this trades a bit of connection-pool contention for latency.
  const [subjectStatsResult, streakResults] = await Promise.all([
    service
      .from('student_subject_stats')
      .select(
        'student_id, subject_id, total_sessions, total_correct, total_answered, avg_accuracy, last_attempted'
      )
      .in('student_id', studentIds),
    Promise.all(
      studentIds.map((id) =>
        (service as unknown as {
          rpc: (name: string, args: Record<string, unknown>) =>
            Promise<{ data: number | null; error: { message: string } | null }>;
        })
          .rpc('get_student_streak', { p_student_id: id })
          .then((r) => (typeof r.data === 'number' ? r.data : Number(r.data ?? 0)))
          .catch(() => 0)
      )
    ),
  ]);

  if (subjectStatsResult.error) {
    return NextResponse.json(
      { error: subjectStatsResult.error.message },
      { status: 500 }
    );
  }

  const subjectStats = (subjectStatsResult.data ?? []) as SubjectStatRow[];

  const records: StudentRecord[] = students.map((p, idx) => {
    const studentSubjects = subjectStats.filter((s) => s.student_id === p.id);

    const totalAnswered = studentSubjects.reduce(
      (sum, s) => sum + Number(s.total_answered ?? 0),
      0
    );
    const totalCorrect = studentSubjects.reduce(
      (sum, s) => sum + Number(s.total_correct ?? 0),
      0
    );
    const overallAccuracy =
      totalAnswered > 0
        ? Math.round((totalCorrect / totalAnswered) * 1000) / 10
        : 0;
    const challengesCompleted = studentSubjects.reduce(
      (sum, s) => sum + Number(s.total_sessions ?? 0),
      0
    );

    let lastActive: string | null = null;
    for (const s of studentSubjects) {
      if (!s.last_attempted) continue;
      if (!lastActive || new Date(s.last_attempted) > new Date(lastActive)) {
        lastActive = s.last_attempted;
      }
    }

    // Build the full subject grid: every configured subject shows
    // up, even if the student has no attempts on it yet. The
    // expand panel uses this to render "No attempts" rows.
    const subjects: SubjectBreakdown[] = SUBJECTS_CONFIG.map((cfg) => {
      const real = studentSubjects.find((s) => s.subject_id === cfg.id);
      if (!real) {
        return {
          subjectId: cfg.id,
          subjectName: cfg.name,
          avgAccuracy: 0,
          sessionsCompleted: 0,
          totalCorrect: 0,
          totalAnswered: 0,
        };
      }
      return {
        subjectId: cfg.id,
        subjectName: cfg.name,
        avgAccuracy:
          Math.round(Number(real.avg_accuracy ?? 0) * 10) / 10,
        sessionsCompleted: Number(real.total_sessions ?? 0),
        totalCorrect: Number(real.total_correct ?? 0),
        totalAnswered: Number(real.total_answered ?? 0),
      };
    });

    return {
      id: p.id,
      fullName: p.full_name ?? '(no name)',
      email: p.email ?? '',
      joinedAt: p.created_at,
      totalAnswered,
      totalCorrect,
      overallAccuracy,
      challengesCompleted,
      lastActive,
      streakDays: streakResults[idx] ?? 0,
      subjects,
    };
  });

  return NextResponse.json({ students: records });
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
