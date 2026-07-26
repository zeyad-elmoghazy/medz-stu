import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@/lib/supabase-server';
import type { Database } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/overview
 *
 * The admin dashboard's single-shot fetch. Returns:
 *   - platform counts (professors, students, subjects)
 *   - per-professor authoring activity (published, under review,
 *     drafts, flagged) so the admin sees every content change a
 *     professor makes
 *   - per-subject question totals via chapters.published_count
 *     (the same live column the student dashboard reads)
 *   - the last 10 upload_jobs across all professors
 *   - the last 10 published questions
 *
 * Auth: role = 'admin'. Data goes through the cookie-scoped
 * client (RLS on modules/chapters is public-read; questions and
 * upload_jobs have admin bypass built into their policies).
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
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const client = supabase as unknown as {
    from: (t: string) => {
      select: (
        c: string,
        o?: { count?: 'exact'; head?: boolean }
      ) => Record<string, unknown>;
    };
  };

  type QueryChain = {
    eq: (c: string, v: unknown) => QueryChain;
    in: (c: string, v: unknown[]) => QueryChain;
    order: (c: string, o: { ascending: boolean }) => QueryChain;
    limit: (n: number) => Promise<{
      data: unknown[] | null;
      error: { message: string } | null;
      count: number | null;
    }>;
    then?: unknown;
  };

  // --- counts (head:true so no rows come back) ---
  const professorCountRes = await (client
    .from('profiles')
    .select('id', { count: 'exact', head: true }) as unknown as QueryChain)
    .eq('role', 'professor')
    .limit(0);

  const studentCountRes = await (client
    .from('profiles')
    .select('id', { count: 'exact', head: true }) as unknown as QueryChain)
    .eq('role', 'student')
    .limit(0);

  const questionsCountRes = await (client.from('questions').select('id', {
    count: 'exact',
    head: true,
  }) as unknown as {
    eq: (c: string, v: string) => Promise<{
      count: number | null;
      error: { message: string } | null;
    }>;
  }).eq('status', 'published');

  // --- professors + their per-status counts (raw fetch + group) ---
  const professorsRes = (await (client
    .from('profiles')
    .select('id, full_name, email, created_at') as unknown as QueryChain)
    .eq('role', 'professor')
    .limit(200)) as {
    data: {
      id: string;
      full_name: string | null;
      email: string | null;
      created_at: string;
    }[] | null;
    error: { message: string } | null;
  };

  const professors = professorsRes.data ?? [];
  const professorIds = professors.map((p) => p.id);

  // Per-professor question stats. One scan grouped in-app.
  type QuestionSlim = {
    id: number;
    professor_id: string | null;
    subject_id: string;
    status: string;
    flag_count: number;
    created_at: string;
  };

  const questionRowsRes = (await ((client.from('questions').select(
    'id, professor_id, subject_id, status, flag_count, created_at'
  ) as unknown as QueryChain).in('professor_id', professorIds.length ? professorIds : ['00000000-0000-0000-0000-000000000000']).limit(5000))) as {
    data: QuestionSlim[] | null;
    error: { message: string } | null;
  };
  const questionRows = questionRowsRes.data ?? [];

  const perProf = new Map<
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
      perProf.get(q.professor_id) ?? {
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
    perProf.set(q.professor_id, bucket);
  }

  const professorActivity = professors.map((p) => ({
    id: p.id,
    full_name: p.full_name,
    email: p.email,
    joined_at: p.created_at,
    stats: perProf.get(p.id) ?? {
      draft: 0,
      under_review: 0,
      published: 0,
      archived: 0,
      flagged: 0,
      last_activity: null,
    },
  }));

  // --- subjects with live per-subject published totals ---
  type ModuleRow = {
    code: string;
    subject_id: string;
    name: string;
    is_active: boolean;
    professor_id: string | null;
  };
  const modulesRes = (await (client
    .from('modules')
    .select(
      'code, subject_id, name, is_active, professor_id'
    ) as unknown as QueryChain).limit(500)) as {
    data: ModuleRow[] | null;
    error: { message: string } | null;
  };
  type ChapterRow = {
    module_code: string;
    published_count: number;
    question_count: number;
  };
  const chaptersRes = (await (client
    .from('chapters')
    .select('module_code, published_count, question_count') as unknown as QueryChain).limit(2000)) as {
    data: ChapterRow[] | null;
    error: { message: string } | null;
  };

  const modulesRows = modulesRes.data ?? [];
  const chaptersRows = chaptersRes.data ?? [];

  const subjectAgg = new Map<
    string,
    {
      subject_id: string;
      module_count: number;
      question_count: number;
      published_count: number;
      professor_ids: Set<string>;
    }
  >();
  for (const m of modulesRows) {
    const bucket = subjectAgg.get(m.subject_id) ?? {
      subject_id: m.subject_id,
      module_count: 0,
      question_count: 0,
      published_count: 0,
      professor_ids: new Set<string>(),
    };
    bucket.module_count += 1;
    if (m.professor_id) bucket.professor_ids.add(m.professor_id);
    const totals = chaptersRows
      .filter((c) => c.module_code === m.code)
      .reduce(
        (acc, c) => ({
          q: acc.q + (Number(c.question_count) || 0),
          p: acc.p + (Number(c.published_count) || 0),
        }),
        { q: 0, p: 0 }
      );
    bucket.question_count += totals.q;
    bucket.published_count += totals.p;
    subjectAgg.set(m.subject_id, bucket);
  }
  const subjects = Array.from(subjectAgg.values()).map((s) => ({
    subject_id: s.subject_id,
    module_count: s.module_count,
    question_count: s.question_count,
    published_count: s.published_count,
    professor_count: s.professor_ids.size,
  }));

  // --- recent upload_jobs across everyone ---
  const uploadsRes = (await (client
    .from('upload_jobs')
    .select(
      'id, professor_id, module_code, chapter_id, method, status, questions_extracted, questions_under_review, created_at, completed_at'
    ) as unknown as QueryChain)
    .order('created_at', { ascending: false })
    .limit(10)) as {
    data: {
      id: string;
      professor_id: string;
      module_code: string | null;
      chapter_id: string | null;
      method: string;
      status: string;
      questions_extracted: number;
      questions_under_review: number;
      created_at: string;
      completed_at: string | null;
    }[] | null;
    error: { message: string } | null;
  };

  const nameById = new Map(
    professors.map((p) => [p.id, p.full_name ?? p.email ?? p.id])
  );
  const recent_uploads = (uploadsRes.data ?? []).map((u) => ({
    ...u,
    professor_name: nameById.get(u.professor_id) ?? 'Unknown',
  }));

  // --- recent published questions across all professors ---
  const recentPublishedRes = (await ((client
    .from('questions')
    .select(
      'id, professor_id, subject_id, question, chapter_id, created_at'
    ) as unknown as QueryChain)
    .eq('status', 'published')
    .order('created_at', { ascending: false })
    .limit(10)) as unknown as {
    data:
      | {
          id: number;
          professor_id: string | null;
          subject_id: string;
          question: string;
          chapter_id: string | null;
          created_at: string;
        }[]
      | null;
    error: { message: string } | null;
  });
  const recent_published = (recentPublishedRes.data ?? []).map((q) => ({
    ...q,
    professor_name: q.professor_id ? nameById.get(q.professor_id) ?? 'Unknown' : 'Seed',
    question_preview: q.question.slice(0, 100),
  }));

  return NextResponse.json(
    {
      counts: {
        professors: professorCountRes.count ?? 0,
        students: studentCountRes.count ?? 0,
        published_questions: questionsCountRes.count ?? 0,
        total_questions: questionRows.length,
        under_review: questionRows.filter((q) => q.status === 'under_review').length,
        draft: questionRows.filter((q) => q.status === 'draft').length,
        flagged: questionRows.filter((q) => (q.flag_count ?? 0) > 0).length,
      },
      professors: professorActivity,
      subjects,
      recent_uploads,
      recent_published,
    },
    {
      headers: { 'Cache-Control': 'private, max-age=30' },
    }
  );
}
