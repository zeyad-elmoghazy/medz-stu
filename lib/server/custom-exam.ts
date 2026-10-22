import 'server-only';

/**
 * Pure server-side logic for the Custom Exam routes
 * (app/api/student/custom-exam/**) — kept free of I/O so it can be unit
 * tested. Mirrors what the chapter-quiz routes do inline, adapted for a
 * question set that spans several chapters.
 */

/**
 * Picks `count` distinct question ids from `pool`, in random order.
 *
 * Duplicate ids in the pool collapse first. Throws RangeError when
 * `count` is not a positive integer or is larger than the number of
 * distinct ids — the route turns that into a 400, but it should never
 * be reached because it validates against the live count first.
 * `rand` is injectable for deterministic tests.
 */
export function drawQuestionIds(
  pool: number[],
  count: number,
  rand: () => number = Math.random
): number[] {
  if (!Number.isInteger(count) || count < 1) {
    throw new RangeError('count must be a positive integer');
  }
  const unique = Array.from(new Set(pool));
  if (count > unique.length) {
    throw new RangeError(`count ${count} exceeds the ${unique.length} questions available`);
  }
  // Fisher–Yates over the whole pool, then take the first `count`.
  for (let i = unique.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.floor(rand() * (i + 1)));
    [unique[i], unique[j]] = [unique[j], unique[i]];
  }
  return unique.slice(0, count);
}

/**
 * Splits `items` into slices of at most `size`. Used to keep PostgREST
 * `IN (...)` filters short: a long list of UUIDs in a GET query string
 * can exceed proxy URL limits.
 */
export function chunk<T>(items: T[], size: number): T[][] {
  if (!Number.isInteger(size) || size < 1) {
    throw new RangeError('chunk size must be a positive integer');
  }
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Re-orders `rows` to follow `ids`. Ids with no row (a question
 * unpublished or deleted since the exam was drawn) are skipped, and a
 * repeated id yields its row once — so an exam keeps its drawn order
 * even though the database returns rows in arbitrary order.
 */
export function orderByIds<T extends { id: number }>(rows: T[], ids: number[]): T[] {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const seen = new Set<number>();
  const out: T[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    const row = byId.get(id);
    if (row) {
      seen.add(id);
      out.push(row);
    }
  }
  return out;
}

export type ExamAnswerKeyRow = { id: number; correct_answer: string };

export type ExamQuestionResult = {
  questionId: number;
  chosen: string | null;
  correct: string;
  isCorrect: boolean;
};

/**
 * Scores an exam against the canonical answer key. `questions` is the
 * exam's own question list (in exam order): answers for anything else
 * are ignored, and a skipped question is wrong and counts against
 * accuracy — same as the chapter submit route.
 */
export function scoreExam(
  questions: ExamAnswerKeyRow[],
  answers: Record<string, string>
): { results: ExamQuestionResult[]; score: number; total: number; accuracy: number } {
  const results: ExamQuestionResult[] = questions.map((q) => {
    const chosen = answers[String(q.id)] ?? null;
    return {
      questionId: q.id,
      chosen,
      correct: q.correct_answer,
      isCorrect: chosen === q.correct_answer,
    };
  });
  const score = results.filter((r) => r.isCorrect).length;
  const total = questions.length;
  const accuracy = total > 0 ? Number(((score / total) * 100).toFixed(2)) : 0;
  return { results, score, total, accuracy };
}

/**
 * Merges a saved snapshot of answers into what is already stored.
 * Answers are final once submitted in the quiz UI, so a late or retried
 * save carrying FEWER answers must never erase newer ones: existing
 * answers are kept, incoming ones win, and anything that is not an
 * integer id inside `allowedIds` (this exam's questions) is dropped.
 */
export function mergeExamAnswers(
  existing: Record<string, string> | null | undefined,
  incoming: Record<string, string>,
  allowedIds: Set<number>
): Record<string, string> {
  const merged: Record<string, string> = {};
  for (const source of [existing ?? {}, incoming]) {
    for (const [key, choice] of Object.entries(source)) {
      if (!/^\d+$/.test(key)) continue;
      const id = Number(key);
      if (allowedIds.has(id)) merged[String(id)] = choice;
    }
  }
  return merged;
}
