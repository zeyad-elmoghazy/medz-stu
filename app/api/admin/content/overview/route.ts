import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/require-admin';
import { untypedFrom } from '@/lib/supabase-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/content/overview
 *
 * Overview section KPIs. Admin (Zoz/Ammar) content activity shows
 * up both as a unified feed (/api/admin/content/activity) and, here,
 * as a per-author breakdown (ported from the retired /api/admin/
 * overview route) — "author" is derived from professor_id appearing
 * on questions, upload_jobs, or modules, since 015_b2c_pivot_rebuild
 * collapsed role='professor' into 'admin' and left profiles with no
 * standalone "is an author" flag.
 *
 * Returns: user counts, question counts by status, module/subject/
 * chapter counts, per-author activity, and a 14-day DAU trend from
 * quiz_sessions.
 */
export async function GET() {
  const { supabase, error } = await requireAdmin();
  if (error) return error;

  const [
    studentCountRes,
    adminCountRes,
    moduleCountRes,
    subjectCountRes,
    chapterCountRes,
    questionRowsRes,
    uploadJobAuthorsRes,
    moduleAuthorsRes,
    recentSessionsRes,
    recentActivityRes,
  ] = await Promise.all([
    untypedFrom(supabase).from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'student'),
    untypedFrom(supabase).from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'admin'),
    untypedFrom(supabase).from('modules').select('code', { count: 'exact', head: true }),
    untypedFrom(supabase).from('subjects').select('id', { count: 'exact', head: true }),
    untypedFrom(supabase).from('chapters').select('id', { count: 'exact', head: true }),
    untypedFrom(supabase).from('questions').select('id, professor_id, status, flag_count, created_at'),
    untypedFrom(supabase).from('upload_jobs').select('professor_id').limit(2000),
    untypedFrom(supabase).from('modules').select('professor_id').limit(500),
    untypedFrom(supabase)
      .from('quiz_sessions')
      .select('student_id, completed_at')
      .gte('completed_at', new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()),
    untypedFrom(supabase)
      .from('activity_log')
      .select('id, actor_id, action, entity_type, entity_id, summary, created_at, profiles(full_name, email)')
      .order('created_at', { ascending: false })
      .limit(10),
  ]);

  const questionRows = (questionRowsRes.data ?? []) as {
    id: number;
    professor_id: string | null;
    status: string;
    flag_count: number;
    created_at: string;
  }[];
  const questionCounts = {
    published: questionRows.filter((q) => q.status === 'published').length,
    under_review: questionRows.filter((q) => q.status === 'under_review').length,
    draft: questionRows.filter((q) => q.status === 'draft').length,
    archived: questionRows.filter((q) => q.status === 'archived').length,
    total: questionRows.length,
  };

  // --- per-author activity ---
  const authorIds = Array.from(
    new Set(
      [
        ...questionRows.map((q) => q.professor_id),
        ...((uploadJobAuthorsRes.data ?? []) as { professor_id: string | null }[]).map((u) => u.professor_id),
        ...((moduleAuthorsRes.data ?? []) as { professor_id: string | null }[]).map((m) => m.professor_id),
      ].filter((id): id is string => Boolean(id))
    )
  );

  const authorsRes = authorIds.length
    ? await untypedFrom(supabase).from('profiles').select('id, full_name, email, created_at').in('id', authorIds)
    : { data: [] as unknown[] };
  const authors = (authorsRes.data ?? []) as {
    id: string;
    full_name: string | null;
    email: string | null;
    created_at: string;
  }[];

  const perAuthor = new Map<
    string,
    {
      draft: number;
      under_review: number;
      published: number;
      archived: number;
      flagged: number;
      last_activity: string | null;
    }
  >();
  for (const q of questionRows) {
    if (!q.professor_id) continue;
    const bucket =
      perAuthor.get(q.professor_id) ?? {
        draft: 0,
        under_review: 0,
        published: 0,
        archived: 0,
        flagged: 0,
        last_activity: null,
      };
    if (q.status in bucket) {
      (bucket as unknown as Record<string, number>)[q.status] += 1;
    }
    if ((q.flag_count ?? 0) > 0) bucket.flagged += 1;
    if (!bucket.last_activity || q.created_at > bucket.last_activity) {
      bucket.last_activity = q.created_at;
    }
    perAuthor.set(q.professor_id, bucket);
  }

  const authorActivity = authors.map((a) => ({
    id: a.id,
    full_name: a.full_name,
    email: a.email,
    joined_at: a.created_at,
    stats: perAuthor.get(a.id) ?? {
      draft: 0,
      under_review: 0,
      published: 0,
      archived: 0,
      flagged: 0,
      last_activity: null,
    },
  }));

  // DAU trend: distinct students per day over the last 14 days,
  // grouped in-app — worth promoting to a materialized view later
  // if this ever gets slow.
  const sessions = (recentSessionsRes.data ?? []) as { student_id: string; completed_at: string }[];
  const dauByDay = new Map<string, Set<string>>();
  for (const s of sessions) {
    const day = s.completed_at.slice(0, 10);
    if (!dauByDay.has(day)) dauByDay.set(day, new Set());
    dauByDay.get(day)!.add(s.student_id);
  }
  const dauTrend = Array.from(dauByDay.entries())
    .map(([date, students]) => ({ date, activeStudents: students.size }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return NextResponse.json(
    {
      counts: {
        students: studentCountRes.count ?? 0,
        admins: adminCountRes.count ?? 0,
        modules: moduleCountRes.count ?? 0,
        subjects: subjectCountRes.count ?? 0,
        chapters: chapterCountRes.count ?? 0,
        questions: questionCounts,
      },
      dauTrend,
      recentActivity: recentActivityRes.data ?? [],
      authorActivity,
    },
    { headers: { 'Cache-Control': 'private, max-age=30' } }
  );
}
