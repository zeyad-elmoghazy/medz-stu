import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/require-admin';
import { untypedFrom } from '@/lib/supabase-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/content/overview
 *
 * Overview section KPIs — no professor-specific stats since there
 * are no professors anymore; Admin (Zoz/Ammar) content activity
 * shows up in the Activity Log (/api/admin/content/activity)
 * instead of a per-professor breakdown.
 *
 * Returns: user counts, question counts by status, module/subject/
 * chapter counts, and a 14-day DAU trend from quiz_sessions.
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
    recentSessionsRes,
    recentActivityRes,
  ] = await Promise.all([
    untypedFrom(supabase).from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'student'),
    untypedFrom(supabase).from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'admin'),
    untypedFrom(supabase).from('modules').select('code', { count: 'exact', head: true }),
    untypedFrom(supabase).from('subjects').select('id', { count: 'exact', head: true }),
    untypedFrom(supabase).from('chapters').select('id', { count: 'exact', head: true }),
    untypedFrom(supabase).from('questions').select('id, status'),
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

  const questionRows = (questionRowsRes.data ?? []) as { id: number; status: string }[];
  const questionCounts = {
    published: questionRows.filter((q) => q.status === 'published').length,
    under_review: questionRows.filter((q) => q.status === 'under_review').length,
    draft: questionRows.filter((q) => q.status === 'draft').length,
    archived: questionRows.filter((q) => q.status === 'archived').length,
    total: questionRows.length,
  };

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
    },
    { headers: { 'Cache-Control': 'private, max-age=30' } }
  );
}
