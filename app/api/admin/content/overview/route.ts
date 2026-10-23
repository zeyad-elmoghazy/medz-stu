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
 * previously also as a per-author breakdown keyed on the
 * professor_id column (questions/modules) and the upload_jobs
 * table. Both were removed in 024_drop_professor_columns_and_jobs_
 * tables.sql — professor_id was confirmed always NULL on every row
 * of every table that had it (0 real "authors" ever attributed), so
 * authorActivity below returns [] unconditionally now: identical to
 * its actual behavior before this change, just without querying
 * columns/a table that no longer exist. Kept as a field (rather than
 * dropped from the response) so AdminOverviewPanel.tsx's existing
 * "No author activity yet" empty state keeps working unmodified.
 *
 * Returns: user counts, question counts by status, module/subject/
 * chapter counts, per-author activity (always empty, see above), and
 * a 14-day DAU trend from quiz_sessions.
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
    publishedCountRes,
    underReviewCountRes,
    draftCountRes,
    archivedCountRes,
    recentSessionsRes,
    recentActivityRes,
    openReportsRes,
  ] = await Promise.all([
    untypedFrom(supabase).from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'student'),
    untypedFrom(supabase).from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'admin'),
    untypedFrom(supabase).from('modules').select('code', { count: 'exact', head: true }),
    untypedFrom(supabase).from('subjects').select('id', { count: 'exact', head: true }),
    untypedFrom(supabase).from('chapters').select('id', { count: 'exact', head: true }),
    // Head-only counts per status: a full-table select would be capped at
    // PostgREST's 1,000-row limit and under-report a 5k+ question bank.
    ...(['published', 'under_review', 'draft', 'archived'] as const).map((status) =>
      untypedFrom(supabase)
        .from('questions')
        .select('id', { count: 'exact', head: true })
        .eq('status', status)
    ),
    untypedFrom(supabase)
      .from('quiz_sessions')
      .select('student_id, completed_at')
      .gte('completed_at', new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()),
    untypedFrom(supabase)
      .from('activity_log')
      .select('id, actor_id, action, entity_type, entity_id, summary, created_at, profiles(full_name, email)')
      .order('created_at', { ascending: false })
      .limit(10),
    // Unresolved student reports (Reports tab). A failed count — e.g.
    // migration 033's admin policy not applied yet — reads as 0 rather
    // than breaking the whole overview.
    untypedFrom(supabase)
      .from('question_flags')
      .select('id', { count: 'exact', head: true })
      .eq('resolved', false),
  ]);

  const questionCounts = {
    published: publishedCountRes.count ?? 0,
    under_review: underReviewCountRes.count ?? 0,
    draft: draftCountRes.count ?? 0,
    archived: archivedCountRes.count ?? 0,
    total: 0,
  };
  questionCounts.total =
    questionCounts.published +
    questionCounts.under_review +
    questionCounts.draft +
    questionCounts.archived;

  const authorActivity: {
    id: string;
    full_name: string | null;
    email: string | null;
    joined_at: string;
    stats: {
      draft: number;
      under_review: number;
      published: number;
      archived: number;
      flagged: number;
      last_activity: string | null;
    };
  }[] = [];

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
        openReports: openReportsRes.count ?? 0,
      },
      dauTrend,
      recentActivity: recentActivityRes.data ?? [],
      authorActivity,
    },
    { headers: { 'Cache-Control': 'private, max-age=30' } }
  );
}
