import 'server-only';
import { untypedFrom } from '@/lib/supabase-server';

/**
 * Read side of `chapter_quiz_progress` (supabase/migrations/032) for
 * the Progress dashboard: a chapter the student has started but not
 * finished. Completed attempts live in `quiz_sessions` and are
 * aggregated by the `student_subject_stats` matview; unfinished ones
 * are scored here, live, against the canonical answer key and merged
 * in by /api/student/stats so answers given in a half-finished chapter
 * show up right away. Finishing the chapter deletes the progress row
 * (see the /submit route), so nothing is counted twice.
 */

export type ProgressRow = {
  chapter_id: string;
  subject_id: string;
  answers: Record<string, string> | null;
  total_questions: number;
  updated_at: string;
};

export type InProgressChapter = {
  chapterId: string;
  /** Subject slug, same convention as quiz_sessions.subject_id. */
  subjectId: string;
  /** Questions answered so far (that still exist in the bank). */
  answered: number;
  correct: number;
  /** Questions in the whole attempt. */
  total: number;
  updatedAt: string;
};

/**
 * Pure scoring step. `answerKey` maps question id -> correct choice id.
 * Answers for questions no longer in the key (unpublished/deleted since)
 * are ignored, and a row with nothing left to count is dropped.
 */
export function scoreProgressRows(
  rows: ProgressRow[],
  answerKey: Map<number, string>
): InProgressChapter[] {
  const out: InProgressChapter[] = [];
  for (const row of rows) {
    let answered = 0;
    let correct = 0;
    for (const [key, chosen] of Object.entries(row.answers ?? {})) {
      const correctChoice = answerKey.get(Number(key));
      if (correctChoice === undefined) continue;
      answered += 1;
      if (chosen === correctChoice) correct += 1;
    }
    if (answered === 0) continue;
    out.push({
      chapterId: row.chapter_id,
      subjectId: row.subject_id,
      answered,
      correct,
      total: Math.max(Number(row.total_questions) || 0, answered),
      updatedAt: row.updated_at,
    });
  }
  return out;
}

export type SubjectAggregate = {
  total_sessions: number;
  total_correct: number;
  total_answered: number;
  avg_accuracy: number;
};

/**
 * Folds one subject's unfinished chapters into its completed-attempt
 * aggregate (a `student_subject_stats` row, or undefined when the
 * subject has none yet). Answered/correct add up directly. Accuracy
 * stays an average of per-attempt accuracy, like the matview's
 * AVG(accuracy): each unfinished chapter counts as one more attempt.
 * `total_sessions` is NOT touched — an unfinished chapter isn't a
 * completed challenge.
 */
export function mergeInProgressIntoSubject(
  base: SubjectAggregate | undefined,
  items: InProgressChapter[]
): { totalAnswered: number; totalCorrect: number; avgAccuracy: number } {
  const sessions = base?.total_sessions ?? 0;
  const baseAccuracySum = (base?.avg_accuracy ?? 0) * sessions;
  const itemAccuracySum = items.reduce((sum, i) => sum + (i.correct / i.answered) * 100, 0);
  const attempts = sessions + items.length;
  return {
    totalAnswered: (base?.total_answered ?? 0) + items.reduce((s, i) => s + i.answered, 0),
    totalCorrect: (base?.total_correct ?? 0) + items.reduce((s, i) => s + i.correct, 0),
    avgAccuracy: attempts > 0 ? (baseAccuracySum + itemAccuracySum) / attempts : 0,
  };
}

/**
 * This student's unfinished chapters, scored. Any query error yields
 * an empty list rather than throwing — the dashboard must keep working
 * (and simply omit unfinished chapters) if, say, this table isn't
 * there yet.
 */
export async function fetchInProgressChapters(
  client: unknown,
  studentId: string
): Promise<InProgressChapter[]> {
  const db = untypedFrom(client);

  const { data, error } = await db
    .from('chapter_quiz_progress')
    .select('chapter_id, subject_id, answers, total_questions, updated_at')
    .eq('student_id', studentId);
  if (error || !data) return [];
  const rows = data as ProgressRow[];

  const questionIds = new Set<number>();
  for (const row of rows) {
    for (const key of Object.keys(row.answers ?? {})) {
      const id = Number(key);
      if (Number.isInteger(id)) questionIds.add(id);
    }
  }
  if (questionIds.size === 0) return [];

  const { data: questionRows, error: questionsError } = await db
    .from('questions')
    .select('id, correct_answer')
    .in('id', Array.from(questionIds));
  if (questionsError || !questionRows) return [];

  const answerKey = new Map<number, string>(
    (questionRows as { id: number; correct_answer: string }[]).map((q) => [q.id, q.correct_answer])
  );
  return scoreProgressRows(rows, answerKey);
}
