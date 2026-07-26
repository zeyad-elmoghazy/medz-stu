import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@/lib/supabase-server';
import { createClient } from '@supabase/supabase-js';
import type { Database, UserRole } from '@/lib/supabase';
import {
  SUBJECTS_CONFIG,
  type ChallengeResult,
  type ProgressDataPoint,
  type StudentStats,
  type Subject,
} from '@/lib/dashboard-data';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/student/stats
 *
 * Returns the calling student's full StudentStats payload.
 *
 * Six queries run in parallel (`Promise.all`):
 *   a) profile row
 *   b/c) per-subject aggregates from the
 *        `student_subject_stats` materialized view
 *        — we derive overall totals from this so we
 *        don't burn a second aggregate scan.
 *   d) most recent 5 quiz_sessions
 *   e) all quiz_sessions in the last 30 days (for the
 *      progress chart)
 *   f) `get_student_streak(uuid)` SQL function
 *   g) bookmarks count
 *
 * Response is cached for 60s per-user via Cache-Control.
 * Each student sees their own slice; the cache reduces the
 * post-login dashboard storm without making cross-student
 * leakage possible.
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

  const profileQuery = await supabase
    .from('profiles')
    .select('id, full_name, email, role')
    .eq('id', user.id)
    .single();

  // `@supabase/auth-helpers-nextjs@0.8.x` doesn't fully propagate
  // the Database generic into PostgREST builders, so we cast the
  // returned row to the shape we know the query selects.
  type ProfileSlice = {
    id: string;
    full_name: string | null;
    email: string | null;
    role: UserRole;
  };
  const roleRow = profileQuery.data as ProfileSlice | null;

  if (profileQuery.error || !roleRow) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
  }

  if (roleRow.role !== 'student') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();

  // Live per-subject published question count — sums the
  // chapters.published_count column that the professor
  // authoring trigger maintains. Reading it here means the
  // student dashboard sees a new number the moment a
  // professor publishes a question (once the cache expires).
  //
  // Shape: modules.subject_id + JOIN chapters. We fetch both
  // and sum client-side to keep the query below trivial.
  const modulesForCountsPromise = (supabase as unknown as {
    from: (t: string) => {
      select: (c: string) => Promise<{
        data: Array<{ code: string; subject_id: string }> | null;
        error: { message: string } | null;
      }>;
    };
  })
    .from('modules')
    .select('code, subject_id');
  const chaptersForCountsPromise = (supabase as unknown as {
    from: (t: string) => {
      select: (c: string) => Promise<{
        data: Array<{ module_code: string; published_count: number }> | null;
        error: { message: string } | null;
      }>;
    };
  })
    .from('chapters')
    .select('module_code, published_count');

  const [
    subjectStatsRes,
    recentSessionsRes,
    progressSessionsRes,
    streakRes,
    bookmarksRes,
    modulesForCountsRes,
    chaptersForCountsRes,
  ] = await Promise.all([
    // (b/c) per-subject aggregates — also feeds the overall totals.
    // Reads the matview via the service-role client because API access
    // to the matview is revoked from anon/authenticated (advisor 0016).
    service
      .from('student_subject_stats')
      .select(
        'subject_id, total_sessions, total_correct, total_answered, avg_accuracy, best_accuracy, last_attempted'
      )
      .eq('student_id', user.id),

    // (d) recent 5 sessions
    supabase
      .from('quiz_sessions')
      .select('id, subject_id, score, total_questions, accuracy, completed_at')
      .eq('student_id', user.id)
      .order('completed_at', { ascending: false })
      .limit(5),

    // (e) progress history — last 30 days, oldest first for the chart
    supabase
      .from('quiz_sessions')
      .select('accuracy, completed_at')
      .eq('student_id', user.id)
      .gte('completed_at', thirtyDaysAgo)
      .order('completed_at', { ascending: true }),

    // (f) streak — DB-side function, single integer back.
    // Cast to any because the auth-helpers client's rpc() doesn't
    // pick up the Database['public']['Functions'] generic.
    (supabase as unknown as {
      rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: number | null; error: { message: string } | null }>;
    }).rpc('get_student_streak', { p_student_id: user.id }),

    // (g) bookmarks count — head=true means no rows returned, just the count
    supabase
      .from('bookmarks')
      .select('id', { count: 'exact', head: true })
      .eq('student_id', user.id),

    // (h + i) live per-subject published-question count.
    modulesForCountsPromise,
    chaptersForCountsPromise,
  ]);

  // Aggregate published_count by subject.
  const publishedBySubject = new Map<string, number>();
  const modulesForCounts = modulesForCountsRes.data ?? [];
  const chaptersForCounts = chaptersForCountsRes.data ?? [];
  for (const mod of modulesForCounts) {
    const total = chaptersForCounts
      .filter((c) => c.module_code === mod.code)
      .reduce((sum, c) => sum + (Number(c.published_count) || 0), 0);
    publishedBySubject.set(
      mod.subject_id,
      (publishedBySubject.get(mod.subject_id) ?? 0) + total
    );
  }

  if (subjectStatsRes.error) {
    return NextResponse.json(
      { error: subjectStatsRes.error.message },
      { status: 500 }
    );
  }

  type SubjectStatRow = {
    subject_id: string;
    total_sessions: number | null;
    total_correct: number | null;
    total_answered: number | null;
    avg_accuracy: number | null;
    best_accuracy: number | null;
    last_attempted: string | null;
  };

  type SessionRow = {
    id: string;
    subject_id: string;
    score: number;
    total_questions: number;
    accuracy: number;
    completed_at: string;
  };

  type ProgressRow = { accuracy: number; completed_at: string };

  const subjectStats = ((subjectStatsRes.data ?? []) as SubjectStatRow[]).map(
    (r) => ({
      subject_id: r.subject_id,
      total_sessions: Number(r.total_sessions ?? 0),
      total_correct: Number(r.total_correct ?? 0),
      total_answered: Number(r.total_answered ?? 0),
      avg_accuracy: Number(r.avg_accuracy ?? 0),
      best_accuracy: Number(r.best_accuracy ?? 0),
      last_attempted: r.last_attempted,
    })
  );

  // Overall totals derived from the materialized view rather than a
  // second aggregate scan over quiz_sessions.
  const totalQuestionsAnswered = subjectStats.reduce(
    (sum, s) => sum + s.total_answered,
    0
  );
  const totalCorrectAnswers = subjectStats.reduce(
    (sum, s) => sum + s.total_correct,
    0
  );
  const overallAccuracy =
    totalQuestionsAnswered > 0
      ? Math.round((totalCorrectAnswers / totalQuestionsAnswered) * 1000) / 10
      : 0;

  // Merge real per-subject numbers into the static SUBJECTS_CONFIG so
  // subjects with no sessions yet still appear with zeroed metrics.
  // publishedCount is the LIVE number kept up-to-date by the professor
  // authoring trigger — this is the sync signal.
  const subjects: Subject[] = SUBJECTS_CONFIG.map((config) => {
    const real = subjectStats.find((s) => s.subject_id === config.id);
    const publishedCount = publishedBySubject.get(config.id) ?? 0;
    const base = {
      ...config,
      publishedCount,
    };
    if (!real) return base;

    const accuracy = Math.round(real.avg_accuracy * 10) / 10;
    return {
      ...base,
      accuracy,
      questionsAnswered: real.total_answered,
      correctAnswers: real.total_correct,
      challengesCompleted: real.total_sessions,
      // Progress mirrors accuracy until we have a richer mastery model.
      progress: Math.round(accuracy),
    };
  });

  const recentSessions = (recentSessionsRes.data ?? []) as SessionRow[];
  const recentChallenges: ChallengeResult[] = recentSessions.map((s) => ({
    id: s.id,
    subjectId: s.subject_id,
    subjectName:
      SUBJECTS_CONFIG.find((c) => c.id === s.subject_id)?.name ?? s.subject_id,
    score: s.score,
    total: s.total_questions,
    accuracy: Number(s.accuracy),
    completedAt: s.completed_at,
  }));

  const progressRows = (progressSessionsRes.data ?? []) as ProgressRow[];
  const progressHistory: ProgressDataPoint[] = progressRows.map((r) => ({
    date: formatMonDay(r.completed_at),
    accuracy: Number(r.accuracy),
  }));

  const streakDays =
    typeof streakRes.data === 'number'
      ? streakRes.data
      : Number(streakRes.data ?? 0);

  const lastActiveDate =
    recentSessions[0]?.completed_at ?? new Date().toISOString();

  const stats: StudentStats & {
    profile: { id: string; full_name: string | null; email: string | null };
    bookmarksCount: number;
  } = {
    profile: {
      id: roleRow.id,
      full_name: roleRow.full_name,
      email: roleRow.email,
    },
    bookmarksCount: bookmarksRes.count ?? 0,
    totalQuestionsAnswered,
    totalCorrectAnswers,
    overallAccuracy,
    streakDays,
    lastActiveDate,
    subjects,
    recentChallenges,
    progressHistory,
  };

  return NextResponse.json(stats, {
    headers: {
      // Private cache: each user's browser/CDN edge can keep this
      // for 60 s without cross-user leakage.
      'Cache-Control': 'private, max-age=60',
    },
  });
}

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

function formatMonDay(iso: string): string {
  const d = new Date(iso);
  // "Mon DD" — matches the design (e.g. "May 14", "Jun 11").
  return `${MONTHS[d.getMonth()]} ${d.getDate().toString().padStart(2, '0')}`;
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
