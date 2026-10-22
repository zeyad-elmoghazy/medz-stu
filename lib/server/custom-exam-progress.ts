import 'server-only';
import { untypedFrom } from '@/lib/supabase-server';
import { chunk } from '@/lib/server/custom-exam';

/**
 * Read side of `custom_exam_progress` (supabase/migrations/035) for the
 * Progress dashboard — the Custom Exam counterpart of
 * lib/server/chapter-quiz-progress.ts. An exam the student has started
 * but not finished is scored live against the canonical answer key and
 * merged in by /api/student/stats, so answers given in a half-finished
 * exam show up right away. Submitting the exam deletes the progress row
 * (see the /submit route), so nothing is counted twice.
 */

export type ExamProgressRow = {
  id: string;
  module_code: string;
  chapter_ids: string[] | null;
  answers: Record<string, string> | null;
  total_questions: number;
  updated_at: string;
};

export type InProgressExam = {
  examId: string;
  moduleCode: string;
  /** Chapters the exam was drawn from. */
  chapterCount: number;
  /** Questions answered so far (that still exist in the bank). */
  answered: number;
  correct: number;
  /** Questions in the whole exam. */
  total: number;
  updatedAt: string;
};

/**
 * Pure scoring step. `answerKey` maps question id -> correct choice id.
 * Answers for questions no longer in the key (unpublished/deleted since)
 * are ignored; an exam with nothing left to count yields null.
 */
export function scoreExamProgress(
  row: ExamProgressRow,
  answerKey: Map<number, string>
): InProgressExam | null {
  let answered = 0;
  let correct = 0;
  for (const [key, chosen] of Object.entries(row.answers ?? {})) {
    const correctChoice = answerKey.get(Number(key));
    if (correctChoice === undefined) continue;
    answered += 1;
    if (chosen === correctChoice) correct += 1;
  }
  if (answered === 0) return null;
  return {
    examId: row.id,
    moduleCode: row.module_code,
    chapterCount: (row.chapter_ids ?? []).length,
    answered,
    correct,
    total: Math.max(Number(row.total_questions) || 0, answered),
    updatedAt: row.updated_at,
  };
}

/**
 * This student's unfinished exam, scored — or null if there is none (or
 * nothing in it is countable yet). Any query error yields null rather
 * than throwing: the dashboard must keep working (and simply omit the
 * unfinished exam) if, say, this table isn't there yet.
 */
export async function fetchInProgressExam(
  client: unknown,
  studentId: string
): Promise<InProgressExam | null> {
  const db = untypedFrom(client);

  const { data, error } = await db
    .from('custom_exam_progress')
    .select('id, module_code, chapter_ids, answers, total_questions, updated_at')
    .eq('student_id', studentId)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as ExamProgressRow;

  const questionIds = Object.keys(row.answers ?? {})
    .map(Number)
    .filter((id) => Number.isInteger(id));
  if (questionIds.length === 0) return null;

  const answerKey = new Map<number, string>();
  for (const part of chunk(questionIds, 150)) {
    const { data: questionRows, error: questionsError } = await db
      .from('questions')
      .select('id, correct_answer')
      .in('id', part);
    if (questionsError || !questionRows) return null;
    for (const q of questionRows as { id: number; correct_answer: string }[]) {
      answerKey.set(q.id, q.correct_answer);
    }
  }
  return scoreExamProgress(row, answerKey);
}
