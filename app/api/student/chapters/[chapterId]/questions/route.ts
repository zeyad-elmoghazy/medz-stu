import { NextRequest, NextResponse } from 'next/server';
import { publicDbError } from '@/lib/api-error';
import { cookies } from 'next/headers';
import { createRouteHandlerClient, untypedFrom } from '@/lib/supabase-server';
import { serviceRoleClient } from '@/lib/supabase-service';
import { applyRateLimit } from '@/lib/apply-rate-limit';
import { contentLimiter } from '@/lib/rate-limit';
import type { Database } from '@/lib/supabase';
import { embedded } from '@/lib/postgrest';
import { chapterBackHref } from '@/lib/catalogue';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/student/chapters/[chapterId]/questions
 *
 * Published questions for one chapter. Powers the chapter-scoped quiz
 * route (student/quiz/chapter/[chapterId]); the Custom Exam, whose
 * questions span chapters, is served by /api/student/custom-exam/[examId].
 *
 * The payload carries NO answers: no correct choice, explanation, rationales
 * or reference. A student gets those one question at a time, after answering
 * it, from POST .../answer (migration 049, question_reveals).
 *
 * Students can't SELECT `questions` directly (migration 047 makes it
 * admin-only, so the question bank can't be paged out over PostgREST),
 * so this reads with the service role and MUST keep the explicit
 * status='published' filter. Rate-limited per user per day.
 *
 * Auth: any signed-in user, same if(!user)-only pattern as
 * /api/student/stats — no role check.
 */
export async function GET(
  request: NextRequest,
  props: { params: Promise<{ chapterId: string }> }
) {
  const params = await props.params;
  const supabase = await createRouteHandlerClient<Database>({ cookies });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const limited = await applyRateLimit(request, contentLimiter, user.id);
  if (limited) return limited;

  const chapterId = params.chapterId;
  const client = untypedFrom(supabase);

  const chapterRes = await client
    .from('chapters')
    .select('id, name, module_code, subjects(name, slug), modules(year_num)')
    .eq('id', chapterId)
    .single();

  if (chapterRes.error || !chapterRes.data) {
    return NextResponse.json({ error: 'Chapter not found' }, { status: 404 });
  }
  const chapter = chapterRes.data as {
    id: string;
    name: string;
    module_code: string;
    // PostgREST embeds a to-one join as an object, but typings may say array.
    subjects: { name: string; slug: string } | { name: string; slug: string }[] | null;
    modules: { year_num: string } | { year_num: string }[] | null;
  };
  const subject = embedded(chapter.subjects);
  const moduleRow = embedded(chapter.modules);

  const questionsRes = await untypedFrom(serviceRoleClient())
    .from('questions')
    .select('id, question, choices, topic')
    .eq('chapter_id', chapterId)
    .eq('status', 'published')
    .order('id', { ascending: true });

  if (questionsRes.error) {
    return NextResponse.json({ error: publicDbError(questionsRes.error) }, { status: 500 });
  }

  type QuestionRow = {
    id: number;
    question: string;
    choices: { id: string; text: string }[];
    topic: string;
  };
  const rows = (questionsRes.data ?? []) as QuestionRow[];

  return NextResponse.json(
    {
      chapterId: chapter.id,
      chapterName: chapter.name,
      moduleCode: chapter.module_code,
      subjectName: subject?.name ?? '',
      // Where "Back to <Subject>" and Save & Exit should land.
      subjectHref: chapterBackHref({
        yearNum: moduleRow?.year_num,
        moduleCode: chapter.module_code,
        subjectSlug: subject?.slug,
      }),
      questionTotal: rows.length,
      questions: rows.map((r) => ({
        id: r.id,
        question: r.question,
        choices: r.choices,
        topic: r.topic,
      })),
    },
    { headers: { 'Cache-Control': 'private, max-age=30' } }
  );
}
