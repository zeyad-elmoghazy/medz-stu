import 'server-only';
import { untypedFrom } from '@/lib/supabase-server';

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
};

export type ChapterMistakes = {
  chapterId: string;
  questionIds: number[];
};

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
  if (error || !sessions) return [];

  const rows = sessions as {
    chapter_id: string;
    answers: Record<string, string>;
    completed_at: string;
  }[];

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

  const { data: questionRows } = await client
    .from('questions')
    .select('id, topic, correct_answer')
    .in('id', Array.from(questionIds));

  const questionById = new Map(
    ((questionRows ?? []) as { id: number; topic: string; correct_answer: string }[]).map(
      (q) => [q.id, q]
    )
  );

  const attempts: QuestionAttempt[] = [];
  for (const row of rows) {
    for (const [key, chosen] of Object.entries(row.answers ?? {})) {
      const questionId = Number(key);
      const q = questionById.get(questionId);
      // Question since unpublished/deleted — safe to skip, nothing
      // valid to show for it.
      if (!q) continue;
      attempts.push({
        chapterId: row.chapter_id,
        questionId,
        chosen,
        correctAnswer: q.correct_answer,
        topic: q.topic,
        completedAt: row.completed_at,
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
