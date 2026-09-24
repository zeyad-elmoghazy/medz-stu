import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient, untypedFrom } from '@/lib/supabase-server';
import type { Database } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/student/notes?questionId=N
 * GET /api/student/notes              (list mode — no questionId)
 *
 * With `questionId`: the signed-in student's note content for that
 * question, or '' if none exists yet. Without it: every note the
 * student has saved, joined to its question/chapter for display on
 * /student/bookmarks — same manual-batch-join approach as
 * app/api/student/bookmarks/route.ts (notes.question_id has no FK
 * to questions.id either). Same auth pattern as the rest of this
 * route family — RLS (students_own_notes: student_id = auth.uid())
 * does the actual scoping via the cookie-bound client.
 */
export async function GET(request: NextRequest) {
  const supabase = await createRouteHandlerClient<Database>({ cookies });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const client = untypedFrom(supabase);
  const questionIdParam = request.nextUrl.searchParams.get('questionId');

  if (questionIdParam === null) {
    const { data: rows } = await client
      .from('notes')
      .select('id, question_id, content, updated_at')
      .eq('student_id', user.id)
      .order('updated_at', { ascending: false });

    const noteRows =
      (rows as { id: string; question_id: number; content: string; updated_at: string }[] | null) ??
      [];
    if (noteRows.length === 0) {
      return NextResponse.json({ notes: [] });
    }

    const questionIds = noteRows.map((n) => n.question_id);
    const { data: questionRows } = await client
      .from('questions')
      .select('id, question, topic, chapter_id, choices, correct_answer, explanation, choice_rationales')
      .in('id', questionIds);
    type QuestionRow = {
      id: number;
      question: string;
      topic: string;
      chapter_id: string | null;
      choices: { id: string; text: string }[];
      correct_answer: string;
      explanation: string;
      choice_rationales: Record<string, string> | null;
    };
    const questionById = new Map(
      ((questionRows as QuestionRow[] | null) ?? []).map((q) => [q.id, q])
    );

    const chapterIds = Array.from(
      new Set(
        Array.from(questionById.values())
          .map((q) => q.chapter_id)
          .filter((id): id is string => !!id)
      )
    );
    const chapterById = new Map<string, { name: string; module_code: string }>();
    if (chapterIds.length > 0) {
      const { data: chapterRows } = await client
        .from('chapters')
        .select('id, name, module_code')
        .in('id', chapterIds);
      for (const c of (chapterRows as { id: string; name: string; module_code: string }[] | null) ??
        []) {
        chapterById.set(c.id, c);
      }
    }

    const notes = noteRows.map((n) => {
      const q = questionById.get(n.question_id);
      const chapter = q?.chapter_id ? chapterById.get(q.chapter_id) : undefined;
      return {
        id: n.id,
        questionId: n.question_id,
        question: q?.question ?? '(question no longer available)',
        topic: q?.topic ?? '',
        chapterName: chapter?.name ?? null,
        moduleCode: chapter?.module_code ?? null,
        content: n.content,
        updatedAt: n.updated_at,
        choices: q?.choices ?? [],
        correctAnswer: q?.correct_answer ?? null,
        explanation: q?.explanation ?? '',
        choiceRationales: q?.choice_rationales ?? null,
      };
    });

    return NextResponse.json({ notes });
  }

  const questionId = Number(questionIdParam);
  if (!Number.isInteger(questionId)) {
    return NextResponse.json({ error: 'Invalid questionId' }, { status: 400 });
  }

  const { data } = await client
    .from('notes')
    .select('content')
    .eq('student_id', user.id)
    .eq('question_id', questionId)
    .maybeSingle();

  return NextResponse.json({ content: data?.content ?? '' });
}

/**
 * PUT /api/student/notes  { questionId: number, content: string }
 *
 * subject_id is looked up server-side from the question row, same
 * reasoning as the bookmarks route — not trusted from the client.
 */
export async function PUT(request: NextRequest) {
  const supabase = await createRouteHandlerClient<Database>({ cookies });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const questionId = Number(body?.questionId);
  const content = typeof body?.content === 'string' ? body.content : null;
  if (!Number.isInteger(questionId) || content === null) {
    return NextResponse.json({ error: 'Invalid questionId or content' }, { status: 400 });
  }

  const client = untypedFrom(supabase);
  const { data: question, error: questionError } = await client
    .from('questions')
    .select('subject_id')
    .eq('id', questionId)
    .single();

  if (questionError || !question) {
    return NextResponse.json({ error: 'Question not found' }, { status: 404 });
  }

  const { error } = await client.from('notes').upsert(
    {
      student_id: user.id,
      question_id: questionId,
      subject_id: question.subject_id,
      content,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'student_id,question_id' }
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ saved: true });
}
