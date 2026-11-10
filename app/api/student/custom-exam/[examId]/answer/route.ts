import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { publicDbError } from '@/lib/api-error';
import { answerLimiter } from '@/lib/rate-limit';
import { mergeExamAnswers } from '@/lib/server/custom-exam';
import { awardAnswersXp } from '@/lib/server/xp';
import { recordReveals, toReveal } from '@/lib/server/reveal';
import {
  NO_STORE,
  authenticateStudent,
  loadOwnedExam,
  serviceClient,
} from '@/lib/server/custom-exam-db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/student/custom-exam/[examId]/answer
 *   { questionId, choice, currentQuestionIndex }
 *
 * The exam counterpart of POST /api/student/chapters/[chapterId]/answer: the
 * student answers ONE question; the server stores it, credits XP, records
 * that the answer has now been shown to this student (question_reveals,
 * migration 049) and returns the verdict with the explanation. The exam's
 * questions carry no answer key, so this is the only way the exam page
 * learns whether an answer was right.
 *
 * Answers are final: an already-answered question keeps its stored answer
 * and a retry just returns the same verdict.
 */

const ParamsSchema = z.object({ examId: z.string().uuid() });

const BodySchema = z.object({
  questionId: z.number().int(),
  choice: z.string().min(1).max(64),
  currentQuestionIndex: z.number().int().min(0).max(100_000),
});

type QuestionRow = {
  id: number;
  choices: { id: string; text: string }[];
  correct_answer: string;
  explanation: string;
  choice_rationales: Record<string, string> | null;
  reference: string;
  reference_page: number | null;
};

export async function POST(
  request: NextRequest,
  props: { params: Promise<{ examId: string }> }
) {
  const params = ParamsSchema.safeParse(await props.params);
  if (!params.success) {
    return NextResponse.json({ error: 'Invalid exam id' }, { status: 400 });
  }

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
  const { questionId, choice, currentQuestionIndex } = parsed.data;

  const service = serviceClient();
  const { exam, error: loadError } = await loadOwnedExam(service, auth.user.id, params.data.examId);
  if (loadError) return NextResponse.json({ error: loadError }, { status: 500, headers: NO_STORE });
  if (!exam) {
    return NextResponse.json({ error: 'Exam not found' }, { status: 404, headers: NO_STORE });
  }
  if (!exam.question_ids.includes(questionId)) {
    return NextResponse.json(
      { error: 'That question is not part of this exam.' },
      { status: 400, headers: NO_STORE }
    );
  }

  const questionRes = await service
    .from('questions')
    .select('id, choices, correct_answer, explanation, choice_rationales, reference, reference_page')
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
  if (!question) {
    return NextResponse.json({ error: 'Question not found' }, { status: 404, headers: NO_STORE });
  }
  if (!question.choices.some((c) => c.id === choice)) {
    return NextResponse.json({ error: 'Invalid choice' }, { status: 400, headers: NO_STORE });
  }

  const key = String(questionId);
  const existing = exam.answers ?? {};
  let chosen = existing[key];
  let answered = Object.keys(existing).length;
  let xpAwarded = 0;

  if (chosen === undefined) {
    // First answer to this question: store it and credit XP.
    chosen = choice;
    const merged = mergeExamAnswers(existing, { [key]: choice }, new Set(exam.question_ids));
    answered = Object.keys(merged).length;
    const update = await service
      .from('custom_exam_progress')
      .update({
        answers: merged,
        current_question_index: Math.min(
          currentQuestionIndex,
          Math.max(0, exam.total_questions - 1)
        ),
        updated_at: new Date().toISOString(),
      })
      .eq('id', exam.id)
      .eq('student_id', auth.user.id);
    if (update.error) {
      return NextResponse.json(
        { error: publicDbError(update.error) },
        { status: 500, headers: NO_STORE }
      );
    }
    xpAwarded = await awardAnswersXp(service, auth.user.id, { [key]: choice });
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
      xpAwarded,
      answered,
      total: exam.total_questions,
    },
    { headers: NO_STORE }
  );
}
