import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/require-admin';
import { untypedFrom } from '@/lib/supabase-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type FlagRow = {
  id: string;
  question_id: number;
  student_id: string;
  reason: string;
  detail: string | null;
  resolved: boolean;
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
};

type QuestionRow = {
  id: number;
  question: string;
  choices: { id: string; text: string }[];
  correct_answer: string;
  status: string;
  chapter_id: string | null;
};

type ChapterRow = {
  id: string;
  name: string;
  module_code: string;
  subjects: { name: string } | null;
};

type ProfileRow = { id: string; full_name: string | null; email: string | null };

const PAGE_LIMIT = 200;

/**
 * GET /api/admin/content/flags?status=open|resolved|all
 *
 * Student question reports (question_flags, filed from the chapter
 * quiz via /api/student/questions/[questionId]/flag), newest first,
 * for the Reports tab on /admin/content. Defaults to open reports.
 *
 * Read through the request-scoped client: admins see every row via
 * the flags_admin_select policy (033_question_flag_admin.sql). The
 * question / chapter / reporter details are batch lookups rather
 * than PostgREST embeds — question_flags.student_id points at
 * profiles and question_flags.question_id at questions, but keeping
 * the lookups explicit matches the bookmarks route and avoids
 * depending on relationship inference for a table the generated
 * Database type doesn't cover.
 *
 * `counts` is returned unfiltered so the tab can show both totals
 * regardless of the active filter.
 */
export async function GET(request: NextRequest) {
  const { supabase, error } = await requireAdmin();
  if (error) return error;

  const statusParam = request.nextUrl.searchParams.get('status') ?? 'open';
  if (!['open', 'resolved', 'all'].includes(statusParam)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  }

  const client = untypedFrom(supabase);

  let listQuery = client
    .from('question_flags')
    .select('id, question_id, student_id, reason, detail, resolved, created_at, resolved_at, resolved_by')
    .order('created_at', { ascending: false })
    .limit(PAGE_LIMIT);
  if (statusParam === 'open') listQuery = listQuery.eq('resolved', false);
  if (statusParam === 'resolved') listQuery = listQuery.eq('resolved', true);

  const [listRes, openCountRes, resolvedCountRes] = await Promise.all([
    listQuery,
    client.from('question_flags').select('id', { count: 'exact', head: true }).eq('resolved', false),
    client.from('question_flags').select('id', { count: 'exact', head: true }).eq('resolved', true),
  ]);
  if (listRes.error) {
    return NextResponse.json({ error: listRes.error.message }, { status: 500 });
  }

  const rows = (listRes.data ?? []) as FlagRow[];

  const questionIds = Array.from(new Set(rows.map((r) => r.question_id)));
  const profileIds = Array.from(
    new Set(rows.flatMap((r) => [r.student_id, r.resolved_by].filter((v): v is string => !!v)))
  );

  const [questionsRes, profilesRes] = await Promise.all([
    questionIds.length
      ? client
          .from('questions')
          .select('id, question, choices, correct_answer, status, chapter_id')
          .in('id', questionIds)
      : Promise.resolve({ data: [], error: null }),
    profileIds.length
      ? client.from('profiles').select('id, full_name, email').in('id', profileIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (questionsRes.error) {
    return NextResponse.json({ error: questionsRes.error.message }, { status: 500 });
  }
  if (profilesRes.error) {
    return NextResponse.json({ error: profilesRes.error.message }, { status: 500 });
  }

  const questionById = new Map(
    ((questionsRes.data ?? []) as QuestionRow[]).map((q) => [q.id, q])
  );
  const profileById = new Map(((profilesRes.data ?? []) as ProfileRow[]).map((p) => [p.id, p]));

  const chapterIds = Array.from(
    new Set(
      Array.from(questionById.values())
        .map((q) => q.chapter_id)
        .filter((c): c is string => !!c)
    )
  );
  const chapterRes = chapterIds.length
    ? await client.from('chapters').select('id, name, module_code, subjects(name)').in('id', chapterIds)
    : { data: [], error: null };
  if (chapterRes.error) {
    return NextResponse.json({ error: chapterRes.error.message }, { status: 500 });
  }
  const chapterById = new Map(((chapterRes.data ?? []) as ChapterRow[]).map((c) => [c.id, c]));

  const flags = rows.map((r) => {
    const q = questionById.get(r.question_id) ?? null;
    const chapter = q?.chapter_id ? (chapterById.get(q.chapter_id) ?? null) : null;
    const reporter = profileById.get(r.student_id) ?? null;
    const resolver = r.resolved_by ? (profileById.get(r.resolved_by) ?? null) : null;
    return {
      id: r.id,
      questionId: r.question_id,
      reason: r.reason,
      detail: r.detail,
      resolved: r.resolved,
      createdAt: r.created_at,
      resolvedAt: r.resolved_at,
      resolvedBy: resolver ? (resolver.full_name ?? resolver.email) : null,
      reporter: reporter ? { fullName: reporter.full_name, email: reporter.email } : null,
      question: q
        ? {
            text: q.question,
            choices: q.choices,
            correctAnswer: q.correct_answer,
            status: q.status,
            chapterName: chapter?.name ?? null,
            moduleCode: chapter?.module_code ?? null,
            subjectName: chapter?.subjects?.name ?? null,
          }
        : null,
    };
  });

  return NextResponse.json({
    flags,
    counts: { open: openCountRes.count ?? 0, resolved: resolvedCountRes.count ?? 0 },
  });
}
