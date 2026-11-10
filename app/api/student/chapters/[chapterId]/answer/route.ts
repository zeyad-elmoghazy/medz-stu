import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { publicDbError } from '@/lib/api-error';
import { answerLimiter } from '@/lib/rate-limit';
import { NO_STORE, authenticateStudent, serviceClient } from '@/lib/server/custom-exam-db';
import { saveChapterProgress } from '@/lib/server/chapter-quiz-save';
import { recordReveals, toReveal } from '@/lib/server/reveal';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/student/chapters/[chapterId]/answer
 *   { questionId, choice, currentQuestionIndex, questionIds? }
 *
 * The student answers ONE question. The server stores the answer, credits
 * XP, records that this student has now been shown the answer
 * (question_reveals, migration 049) and returns the verdict with the
 * explanation. This is the only way a chapter quiz learns whether an answer
 * was right: the questions payload no longer carries the answer key.
 *
 * Answers are final: re-sending a question that is already answered changes
 * nothing and returns the stored answer's verdict, so a retry after a
 * dropped response is harmless.
 */

const ParamsSchema = z.object({ chapterId: z.string().uuid() });

const BodySchema = z.object({
  questionId: z.number().int(),
  choice: z.string().min(1).max(64),
  currentQuestionIndex: z.number().int().min(0).max(100_000),
  // Present only for a "Practice mistakes" subset run.
  questionIds: z.array(z.number().int()).max(5000).optional(),
});

type QuestionRow = {
  id: number;
  chapter_id: string | null;
  choices: { id: string; text: string }[];
  correct_answer: string;
  explanation: string;
  choice_rationales: Record<string, string> | null;
  reference: string;
  reference_page: number | null;
};

export async function POST(
  request: NextRequest,
  props: { params: Promise<{ chapterId: string }> }
) {
  const params = ParamsSchema.safeParse(await props.params);
  if (!params.success) {
    return NextResponse.json({ error: 'Invalid chapter id' }, { status: 400 });
  }
  const chapterId = params.data.chapterId;

  const auth = await authenticateStudent(request, answerLimiter);
  if (auth.error) return auth.error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid payload', issues: parsed.error.issues },
      { status: 400 }
    );
  }
  const { questionId, choice, currentQuestionIndex, questionIds } = parsed.data;

  // A "Practice mistakes" run only answers the questions it was started with.
  if (questionIds && questionIds.length > 0 && !questionIds.includes(questionId)) {
    return NextResponse.json(
      { error: 'That question is not part of this attempt.' },
      { status: 400, headers: NO_STORE }
    );
  }

  const service = serviceClient();

  const questionRes = await service
    .from('questions')
    .select(
      'id, chapter_id, choices, correct_answer, explanation, choice_rationales, reference, reference_page'
    )
    .eq('id', questionId)
    .eq('status', 'published')
    .maybeSingle();
  if (questionRes.error) {
    return NextResponse.json(
      { error: publicDbError(questionRes.error) },
      { status: 500, headers: NO_STORE }
    );
  }
  const question = questionRes.data as QuestionRow | null;
  // Same answer for "no such question" and "a question of another chapter".
  if (!question || question.chapter_id !== chapterId) {
    return NextResponse.json({ error: 'Question not found' }, { status: 404, headers: NO_STORE });
  }
  if (!question.choices.some((c) => c.id === choice)) {
    return NextResponse.json({ error: 'Invalid choice' }, { status: 400, headers: NO_STORE });
  }

  const saved = await saveChapterProgress(service, auth.user.id, chapterId, {
    answers: { [String(questionId)]: choice },
    currentQuestionIndex,
    questionIds,
    keepExisting: true,
  });
  if (!saved.ok) {
    return NextResponse.json({ error: saved.error }, { status: saved.status, headers: NO_STORE });
  }
  const chosen = saved.merged[String(questionId)];
  if (chosen === undefined) {
    return NextResponse.json(
      { error: 'That question is not part of this attempt.' },
      { status: 400, headers: NO_STORE }
    );
  }

  // Fail closed: if the reveal can't be recorded, don't hand out the answer
  // (a retry is idempotent and tries again).
  const recordError = await recordReveals(service, auth.user.id, [questionId]);
  if (recordError) {
    return NextResponse.json({ error: recordError }, { status: 500, headers: NO_STORE });
  }

  return NextResponse.json(
    {
      isCorrect: chosen === question.correct_answer,
      chosen,
      ...toReveal(question),
      xpAwarded: saved.xpAwarded,
      answered: saved.answered,
      total: saved.total,
    },
    { headers: NO_STORE }
  );
}
