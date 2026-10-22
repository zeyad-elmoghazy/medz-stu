import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { untypedFrom } from '@/lib/supabase-server';
import { quizLimiter } from '@/lib/rate-limit';
import { chunk, drawQuestionIds } from '@/lib/server/custom-exam';
import {
  NO_STORE,
  authenticateStudent,
  fetchPublishedPool,
  fetchPublishedQuestionsByIds,
  serviceClient,
} from '@/lib/server/custom-exam-db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * /api/student/custom-exam
 *
 *   GET  -> the student's unfinished exam (summary), or null — drives
 *           the Continue / Discard banner on the builder page.
 *   POST -> create an exam and return its id. Two shapes:
 *             { moduleCode, chapterIds, count }  a fresh random draw
 *             { moduleCode, questionIds }        a re-sit of specific
 *                                                questions ("Practice
 *                                                mistakes" on results)
 *
 * The draw happens HERE, once, and the drawn ids are stored in
 * custom_exam_progress (migration 035) — so a reload / Save & Exit /
 * Continue always shows the same questions in the same order.
 *
 * The question count is never taken on trust: it is checked against a
 * live count of PUBLISHED questions in the chosen chapters, and an
 * oversized request is rejected with 400 + `available`. Starting a new
 * exam replaces any unfinished one (UNIQUE(student_id); the UI asks the
 * student first).
 */

const CreateSchema = z.union([
  z.object({
    moduleCode: z.string().min(1).max(32),
    chapterIds: z.array(z.string().uuid()).min(1).max(200),
    count: z.number().int().min(1).max(5000),
  }),
  z.object({
    moduleCode: z.string().min(1).max(32),
    questionIds: z.array(z.number().int().positive()).min(1).max(5000),
  }),
]);

export async function GET(request: NextRequest) {
  const auth = await authenticateStudent(request, null);
  if (auth.error) return auth.error;

  // User-scoped client: the table's own-row RLS policy is what limits
  // this to the caller's row.
  const { data, error } = await untypedFrom(auth.supabase)
    .from('custom_exam_progress')
    .select('id, module_code, chapter_ids, answers, total_questions, updated_at, modules(name)')
    .eq('student_id', auth.user.id)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: NO_STORE });
  }
  if (!data) return NextResponse.json({ exam: null }, { headers: NO_STORE });

  type Row = {
    id: string;
    module_code: string;
    chapter_ids: string[];
    answers: Record<string, string> | null;
    total_questions: number;
    updated_at: string;
    modules: { name: string } | { name: string }[] | null;
  };
  const row = data as Row;
  const mod = Array.isArray(row.modules) ? row.modules[0] : row.modules;
  return NextResponse.json(
    {
      exam: {
        id: row.id,
        moduleCode: row.module_code,
        moduleName: mod?.name ?? null,
        chapterCount: row.chapter_ids.length,
        answered: Object.keys(row.answers ?? {}).length,
        total: row.total_questions,
        updatedAt: row.updated_at,
      },
    },
    { headers: NO_STORE }
  );
}

export async function POST(request: NextRequest) {
  const auth = await authenticateStudent(request, quizLimiter);
  if (auth.error) return auth.error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid payload', issues: parsed.error.issues },
      { status: 400 }
    );
  }
  const input = parsed.data;
  const service = serviceClient();

  let drawn: number[];
  let chapterIds: string[];

  if ('chapterIds' in input) {
    // ---- Fresh random draw from the chosen chapters ----
    chapterIds = Array.from(new Set(input.chapterIds));

    // Every chapter must exist and belong to the stated module.
    const found: { id: string; module_code: string }[] = [];
    for (const part of chunk(chapterIds, 40)) {
      const res = await service.from('chapters').select('id, module_code').in('id', part);
      if (res.error) return NextResponse.json({ error: res.error.message }, { status: 500 });
      found.push(...((res.data ?? []) as { id: string; module_code: string }[]));
    }
    if (
      found.length !== chapterIds.length ||
      found.some((c) => c.module_code !== input.moduleCode)
    ) {
      return NextResponse.json(
        { error: 'One or more chapters do not belong to this module.' },
        { status: 400 }
      );
    }

    const { pool, error } = await fetchPublishedPool(service, chapterIds);
    if (error) return NextResponse.json({ error }, { status: 500 });
    const poolIds = Array.from(new Set(pool.map((p) => p.id)));
    const available = poolIds.length;

    if (available === 0) {
      return NextResponse.json(
        { error: 'The selected chapters have no published questions yet.', available: 0 },
        { status: 400 }
      );
    }
    if (input.count > available) {
      return NextResponse.json(
        {
          error: `Only ${available} question${available === 1 ? ' is' : 's are'} available for this selection.`,
          available,
        },
        { status: 400 }
      );
    }
    drawn = drawQuestionIds(poolIds, input.count);
  } else {
    // ---- Re-sit of specific questions (Practice mistakes) ----
    const wanted = Array.from(new Set(input.questionIds));
    const { rows, error } = await fetchPublishedQuestionsByIds<{
      id: number;
      chapter_id: string;
      chapters: { module_code: string } | { module_code: string }[] | null;
    }>(service, wanted, 'id, chapter_id, chapters(module_code)');
    if (error) return NextResponse.json({ error }, { status: 500 });

    // Questions unpublished since are dropped; anything from another
    // module is refused outright.
    const moduleOf = (r: (typeof rows)[number]) =>
      (Array.isArray(r.chapters) ? r.chapters[0] : r.chapters)?.module_code;
    if (rows.some((r) => moduleOf(r) !== input.moduleCode)) {
      return NextResponse.json(
        { error: 'One or more questions do not belong to this module.' },
        { status: 400 }
      );
    }
    if (rows.length === 0) {
      return NextResponse.json(
        { error: 'None of those questions are available any more.', available: 0 },
        { status: 400 }
      );
    }
    drawn = drawQuestionIds(
      rows.map((r) => r.id),
      rows.length
    );
    chapterIds = Array.from(new Set(rows.map((r) => r.chapter_id)));
  }

  const now = new Date().toISOString();
  const examId = crypto.randomUUID();
  const upsert = await service.from('custom_exam_progress').upsert(
    {
      id: examId,
      student_id: auth.user.id,
      module_code: input.moduleCode,
      chapter_ids: chapterIds,
      question_ids: drawn,
      answers: {},
      current_question_index: 0,
      total_questions: drawn.length,
      started_at: now,
      updated_at: now,
    },
    { onConflict: 'student_id' }
  );
  if (upsert.error) {
    return NextResponse.json({ error: upsert.error.message }, { status: 500 });
  }

  return NextResponse.json({ examId, total: drawn.length }, { headers: NO_STORE });
}
