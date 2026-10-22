import 'server-only';
import { untypedFrom } from '@/lib/supabase-server';
import { chunk } from '@/lib/server/custom-exam';

/**
 * Shared derivation used by both /api/student/stats (Focus Areas +
 * the Analytics "Practice mistakes" banner) and
 * /api/student/catalogue/chapters-by-subject (per-chapter "Solve
 * Again" / "Practice mistakes" on the catalogue) — kept in one place
 * so the two surfaces can never disagree about what counts as a
 * "current mistake".
 *
 * Chapter-quiz `quiz_sessions` rows (chapter_id IS NOT NULL — see
 * supabase/migrations/026_quiz_sessions_chapter_id.sql) store
 * `answers` keyed by the real `questions.id` PK, one entry per
 * question the student answered in that attempt.
 */

export type QuestionAttempt = {
  chapterId: string;
  questionId: number;
  chosen: string;
  correctAnswer: string;
  topic: string;
  completedAt: string;
  /**
   * True when the answer comes from a FINISHED attempt (a quiz_sessions
   * row — chapter quiz or custom exam); false for an unfinished one
   * (chapter_quiz_progress / custom_exam_progress). Lets a caller tell
   * "has a completed attempt" from "has answers so far".
   */
  completed?: boolean;
};

export type ChapterMistakes = {
  chapterId: string;
  questionIds: number[];
};

export type ChapterAccuracy = {
  chapterId: string;
  accuracy: number; // 0-100, one decimal
  attempted: number;
};

// Focus Areas policy. A chapter needs at least this many question
// attempts before it counts as a real signal (avoids a one-off miss
// reading as a "weak chapter")…
export const FOCUS_MIN_ATTEMPTS = 3;
// …and the card shows at most this many, weakest first.
export const FOCUS_MAX_AREAS = 3;

/**
 * Per-chapter accuracy across the given attempts, restricted to chapters
 * with enough attempts to be meaningful, weakest first (ties: the chapter
 * with more attempts — i.e. the more reliable signal — first), capped at
 * FOCUS_MAX_AREAS. Chapter — not `questions.topic` — is the unit: topics
 * are near-unique per question in the real bank (2,286 distinct over
 * 5,173 published questions), so a per-topic minimum sample is never met.
 */
export function deriveFocusAreas(attempts: QuestionAttempt[]): ChapterAccuracy[] {
  const byChapter = new Map<string, { attempted: number; correct: number }>();
  for (const a of attempts) {
    const bucket = byChapter.get(a.chapterId) ?? { attempted: 0, correct: 0 };
    bucket.attempted += 1;
    if (a.chosen === a.correctAnswer) bucket.correct += 1;
    byChapter.set(a.chapterId, bucket);
  }

  return Array.from(byChapter.entries())
    .map(([chapterId, { attempted, correct }]) => ({
      chapterId,
      accuracy: Math.round((correct / attempted) * 1000) / 10,
      attempted,
    }))
    .filter((c) => c.attempted >= FOCUS_MIN_ATTEMPTS)
    .sort((a, b) => a.accuracy - b.accuracy || b.attempted - a.attempted)
    .slice(0, FOCUS_MAX_AREAS);
}

/**
 * Fetches this student's chapter-quiz answer history and resolves
 * each answered question's topic/correct_answer, so callers can
 * derive "current mistakes" (deriveChapterMistakes below) and/or
 * per-topic accuracy without duplicating the join.
 *
 * `chapterIds`, when given, scopes the query to just those chapters
 * (the catalogue route only needs the chapters it's about to list).
 * `limitSessions`, when given, bounds how many recent sessions are
 * considered (the dashboard-wide rollup doesn't need the student's
 * entire history).
 */
export async function fetchChapterQuizAttempts(
  service: unknown,
  studentId: string,
  opts: { chapterIds?: string[]; limitSessions?: number } = {}
): Promise<QuestionAttempt[]> {
  const client = untypedFrom(service);

  let query = client
    .from('quiz_sessions')
    .select('chapter_id, answers, completed_at')
    .eq('student_id', studentId)
    .not('chapter_id', 'is', null)
    .order('completed_at', { ascending: false });

  if (opts.chapterIds && opts.chapterIds.length > 0) {
    query = query.in('chapter_id', opts.chapterIds);
  }
  if (opts.limitSessions) {
    query = query.limit(opts.limitSessions);
  }

  const { data: sessions, error } = await query;

  // `chapter_id` is null for custom-exam rows: an exam spans chapters, so
  // each answer is credited to its question's own chapter below.
  type AttemptRow = {
    chapter_id: string | null;
    answers: Record<string, string>;
    completed_at: string;
    /** true = a finished quiz_sessions row; false = an unfinished attempt. */
    completed: boolean;
  };
  const rows: AttemptRow[] =
    error || !sessions
      ? []
      : (sessions as Omit<AttemptRow, 'completed'>[]).map((r) => ({ ...r, completed: true }));

  // Custom-exam sessions (quiz_sessions.exam_id, migration 035) — their
  // `answers` keys are real questions.id values just like chapter rows.
  // Not pre-filtered by chapter: that happens once each answer has been
  // resolved to its chapter. Merged with the chapter sessions above and
  // trimmed to the same recency window so `limitSessions` still means
  // "the N most recent attempts" overall.
  let examQuery = client
    .from('quiz_sessions')
    .select('answers, completed_at')
    .eq('student_id', studentId)
    .not('exam_id', 'is', null)
    .order('completed_at', { ascending: false });
  if (opts.limitSessions) {
    examQuery = examQuery.limit(opts.limitSessions);
  }
  const { data: examSessions, error: examError } = await examQuery;
  if (!examError && examSessions) {
    for (const s of examSessions as { answers: Record<string, string>; completed_at: string }[]) {
      rows.push({ chapter_id: null, answers: s.answers, completed_at: s.completed_at, completed: true });
    }
  }
  if (opts.limitSessions) {
    rows.sort((a, b) => (a.completed_at < b.completed_at ? 1 : a.completed_at > b.completed_at ? -1 : 0));
    rows.splice(opts.limitSessions);
  }

  // Answers from an UNFINISHED attempt (chapter_quiz_progress, migration
  // 032) count too — they are real answers the student gave — so Focus
  // Areas and the mistakes pool reflect them before the chapter is
  // submitted. `updated_at` stands in for the completion time, which
  // keeps "latest attempt per question wins" correct. A failed read
  // here just means no unfinished answers; it never fails the caller.
  let progressQuery = client
    .from('chapter_quiz_progress')
    .select('chapter_id, answers, updated_at')
    .eq('student_id', studentId);
  if (opts.chapterIds && opts.chapterIds.length > 0) {
    progressQuery = progressQuery.in('chapter_id', opts.chapterIds);
  }
  const { data: progress, error: progressError } = await progressQuery;
  if (!progressError && progress) {
    for (const p of progress as { chapter_id: string; answers: Record<string, string>; updated_at: string }[]) {
      rows.push({ chapter_id: p.chapter_id, answers: p.answers, completed_at: p.updated_at, completed: false });
    }
  }

  // Same for an UNFINISHED custom exam (custom_exam_progress, migration
  // 035): its answers are real too, and are credited per question below.
  const { data: examProgress, error: examProgressError } = await client
    .from('custom_exam_progress')
    .select('answers, updated_at')
    .eq('student_id', studentId);
  if (!examProgressError && examProgress) {
    for (const p of examProgress as { answers: Record<string, string>; updated_at: string }[]) {
      rows.push({ chapter_id: null, answers: p.answers, completed_at: p.updated_at, completed: false });
    }
  }
  if (rows.length === 0) return [];

  // Batch-fetch topic/correct_answer once for every question id
  // referenced across these sessions, instead of one lookup each.
  const questionIds = new Set<number>();
  for (const row of rows) {
    for (const key of Object.keys(row.answers ?? {})) {
      const id = Number(key);
      if (Number.isInteger(id)) questionIds.add(id);
    }
  }
  if (questionIds.size === 0) return [];

  // Chunked: custom exams can carry hundreds of answers, and a long
  // `IN (...)` list in one GET query string can exceed proxy URL limits.
  type QuestionLookup = { id: number; topic: string; correct_answer: string; chapter_id: string };
  const lookups: QuestionLookup[] = [];
  for (const part of chunk(Array.from(questionIds), 150)) {
    const { data: questionRows } = await client
      .from('questions')
      .select('id, topic, correct_answer, chapter_id')
      .in('id', part);
    lookups.push(...((questionRows ?? []) as QuestionLookup[]));
  }
  const questionById = new Map(lookups.map((q) => [q.id, q]));

  const scope =
    opts.chapterIds && opts.chapterIds.length > 0 ? new Set(opts.chapterIds) : null;

  const attempts: QuestionAttempt[] = [];
  for (const row of rows) {
    for (const [key, chosen] of Object.entries(row.answers ?? {})) {
      const questionId = Number(key);
      const q = questionById.get(questionId);
      // Question since unpublished/deleted — safe to skip, nothing
      // valid to show for it.
      if (!q) continue;
      // Chapter-quiz rows know their chapter; exam rows credit each
      // answer to the chapter the question actually belongs to.
      const chapterId = row.chapter_id ?? q.chapter_id;
      if (!chapterId) continue;
      if (scope && !scope.has(chapterId)) continue;
      attempts.push({
        chapterId,
        questionId,
        chosen,
        correctAnswer: q.correct_answer,
        topic: q.topic,
        completedAt: row.completed_at,
        completed: row.completed,
      });
    }
  }
  return attempts;
}

/**
 * Groups attempts by chapter, keeping only the question ids whose
 * MOST RECENT attempt (by completedAt) was wrong — mirrors
 * useChapterQuizStore's recordMistakes/clearMistakes semantics
 * exactly: a later correct attempt clears a question from the pool,
 * without needing a mutable table to keep in sync.
 */
export function deriveChapterMistakes(attempts: QuestionAttempt[]): ChapterMistakes[] {
  const latestByKey = new Map<string, QuestionAttempt>();
  for (const a of attempts) {
    const key = `${a.chapterId}:${a.questionId}`;
    const existing = latestByKey.get(key);
    if (!existing || a.completedAt > existing.completedAt) {
      latestByKey.set(key, a);
    }
  }

  const byChapter = new Map<string, number[]>();
  for (const a of latestByKey.values()) {
    if (a.chosen === a.correctAnswer) continue;
    const list = byChapter.get(a.chapterId) ?? [];
    list.push(a.questionId);
    byChapter.set(a.chapterId, list);
  }

  return Array.from(byChapter.entries()).map(([chapterId, questionIds]) => ({
    chapterId,
    questionIds,
  }));
}
