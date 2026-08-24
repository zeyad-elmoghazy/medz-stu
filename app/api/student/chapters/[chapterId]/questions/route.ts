import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient, untypedFrom } from '@/lib/supabase-server';
import type { Database } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/student/chapters/[chapterId]/questions
 *
 * Published questions for one chapter — the chapter-scoped
 * counterpart to /api/questions/[subjectId] (which returns a whole
 * subject's bank, and today only feeds the static Histology page).
 * Powers the new chapter-scoped quiz route
 * (student/quiz/chapter/[chapterId]); does not touch or replace the
 * subject-scoped static quiz path or its data.
 *
 * status='published' is filtered explicitly in the query below
 * rather than relying on RLS alone — RLS (questions_read_published)
 * already enforces this, but the filter is made explicit here too
 * so the guarantee isn't resting on a single, easy-to-miss layer.
 *
 * Auth: any signed-in user, same if(!user)-only pattern as
 * /api/student/stats — no role check.
 */
export async function GET(
  _request: NextRequest,
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

  const chapterId = params.chapterId;
  const client = untypedFrom(supabase);

  const chapterRes = await client
    .from('chapters')
    .select('id, name, module_code, subjects(name)')
    .eq('id', chapterId)
    .single();

  if (chapterRes.error || !chapterRes.data) {
    return NextResponse.json({ error: 'Chapter not found' }, { status: 404 });
  }
  const chapter = chapterRes.data as {
    id: string;
    name: string;
    module_code: string;
    subjects: { name: string } | null;
  };

  const questionsRes = await client
    .from('questions')
    .select(
      'id, question, choices, correct_answer, explanation, choice_rationales, reference, topic'
    )
    .eq('chapter_id', chapterId)
    .eq('status', 'published')
    .order('id', { ascending: true });

  if (questionsRes.error) {
    return NextResponse.json({ error: questionsRes.error.message }, { status: 500 });
  }

  type QuestionRow = {
    id: number;
    question: string;
    choices: { id: string; text: string }[];
    correct_answer: string;
    explanation: string;
    choice_rationales: Record<string, string> | null;
    reference: string;
    topic: string;
  };
  const rows = (questionsRes.data ?? []) as QuestionRow[];

  return NextResponse.json(
    {
      chapterId: chapter.id,
      chapterName: chapter.name,
      moduleCode: chapter.module_code,
      subjectName: chapter.subjects?.name ?? '',
      questionTotal: rows.length,
      questions: rows.map((r) => ({
        id: r.id,
        question: r.question,
        choices: r.choices,
        correctAnswer: r.correct_answer,
        explanation: r.explanation,
        choiceRationales: r.choice_rationales ?? undefined,
        reference: r.reference,
        topic: r.topic,
      })),
    },
    { headers: { 'Cache-Control': 'private, max-age=30' } }
  );
}
