import { NextRequest, NextResponse } from 'next/server';
import { publicDbError } from '@/lib/api-error';
import { z } from 'zod';
import { progressLimiter } from '@/lib/rate-limit';
import { mergeExamAnswers } from '@/lib/server/custom-exam';
import {
  NO_STORE,
  authenticateStudent,
  loadOwnedExam,
  serviceClient,
} from '@/lib/server/custom-exam-db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * PUT /api/student/custom-exam/[examId]/progress
 *
 * Saves the exam so far — called after every answered question and by
 * Save & Exit (which waits for the confirmation). Counterpart of
 * PUT /api/student/chapters/[chapterId]/progress.
 *
 * The question set is fixed when the exam is created, so unlike the
 * chapter route there is nothing to create here: the row already exists
 * and this only updates the answers and position. A missing row (exam
 * already submitted or discarded, e.g. from another tab) is a 404 and
 * the page must not pretend the save worked.
 *
 * Answers are merged, never replaced: a late/retried save carrying fewer
 * answers can't erase newer ones, and ids outside this exam are dropped.
 * Writes use the service-role client, scoped to the caller's student id.
 */

const ParamsSchema = z.object({ examId: z.string().uuid() });

const PutBodySchema = z.object({
  answers: z
    .record(z.string(), z.string().max(64))
    .refine((o) => Object.keys(o).length <= 5000, { message: 'too many answers' }),
  currentQuestionIndex: z.number().int().min(0).max(100_000),
});

export async function PUT(
  request: NextRequest,
  props: { params: Promise<{ examId: string }> }
) {
  const params = ParamsSchema.safeParse(await props.params);
  if (!params.success) {
    return NextResponse.json({ error: 'Invalid exam id' }, { status: 400 });
  }

  const auth = await authenticateStudent(request, progressLimiter);
  if (auth.error) return auth.error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = PutBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid payload', issues: parsed.error.issues },
      { status: 400 }
    );
  }
  const { answers, currentQuestionIndex } = parsed.data;

  const service = serviceClient();
  const { exam, error } = await loadOwnedExam(service, auth.user.id, params.data.examId);
  if (error) return NextResponse.json({ error }, { status: 500 });
  if (!exam) {
    return NextResponse.json({ error: 'Exam not found' }, { status: 404, headers: NO_STORE });
  }

  const merged = mergeExamAnswers(exam.answers, answers, new Set(exam.question_ids));
  const total = exam.total_questions;

  const update = await service
    .from('custom_exam_progress')
    .update({
      answers: merged,
      current_question_index: Math.min(currentQuestionIndex, Math.max(0, total - 1)),
      updated_at: new Date().toISOString(),
    })
    .eq('id', exam.id)
    .eq('student_id', auth.user.id);
  if (update.error) {
    return NextResponse.json({ error: publicDbError(update.error) }, { status: 500 });
  }

  return NextResponse.json(
    { saved: true, answered: Object.keys(merged).length, total },
    { headers: NO_STORE }
  );
}
