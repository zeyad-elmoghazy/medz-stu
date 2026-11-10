import 'server-only';
import { publicDbError } from '@/lib/api-error';
import { awardAnswersXp } from '@/lib/server/xp';

/**
 * Saves a chapter-quiz attempt in progress (table `chapter_quiz_progress`,
 * supabase/migrations/032) and credits XP for the new answers. Shared by
 * PUT .../progress (a snapshot of answers + position) and POST .../answer
 * (one answer, whose result is revealed to the student).
 *
 * `service` must be a service-role client; every write is scoped to
 * `studentId`.
 */

type Db = { from: (table: string) => any };

export type SaveChapterInput = {
  /** Question id -> chosen choice id. */
  answers: Record<string, string>;
  currentQuestionIndex: number;
  /** Present only for a "Practice mistakes" subset run. */
  questionIds?: number[];
  /**
   * An answer already stored for a question is never replaced (the answer
   * endpoint: answers are final once checked). The progress PUT keeps its
   * historical behaviour of letting the incoming snapshot win.
   */
  keepExisting?: boolean;
};

export type SaveChapterResult =
  | { ok: false; status: number; error: string }
  | {
      ok: true;
      /** False when nothing is answered yet and no row is kept. */
      saved: boolean;
      answered: number;
      total: number;
      xpAwarded: number;
      /** All answers stored after this save. */
      merged: Record<string, string>;
      /** Answers stored before this save. */
      existing: Record<string, string>;
    };

export async function saveChapterProgress(
  service: Db,
  studentId: string,
  chapterId: string,
  input: SaveChapterInput
): Promise<SaveChapterResult> {
  const { answers, currentQuestionIndex, questionIds, keepExisting = false } = input;

  // Only published questions of THIS chapter can be part of an attempt
  // — the same bank the submit route scores against.
  const questionsRes = await service
    .from('questions')
    .select('id, subject_id')
    .eq('chapter_id', chapterId)
    .eq('status', 'published');
  if (questionsRes.error) {
    return { ok: false, status: 500, error: publicDbError(questionsRes.error) };
  }
  const bank = (questionsRes.data ?? []) as { id: number; subject_id: string }[];
  if (bank.length === 0) {
    return { ok: false, status: 400, error: 'Chapter has no published questions.' };
  }

  // "Practice mistakes" runs a subset; otherwise the whole chapter.
  const bankIds = new Set(bank.map((q) => q.id));
  let attemptIds: number[] | null = null;
  if (questionIds && questionIds.length > 0) {
    attemptIds = Array.from(new Set(questionIds.filter((id) => bankIds.has(id))));
    if (attemptIds.length === 0) {
      return { ok: false, status: 400, error: 'None of the questionIds belong to this chapter.' };
    }
  }
  const allowed = attemptIds ? new Set(attemptIds) : bankIds;
  const total = attemptIds ? attemptIds.length : bank.length;

  const incoming: Record<string, string> = {};
  for (const [key, choice] of Object.entries(answers)) {
    const id = Number(key);
    if (Number.isInteger(id) && allowed.has(id)) incoming[String(id)] = choice;
  }

  const existingRes = await service
    .from('chapter_quiz_progress')
    .select('answers')
    .eq('student_id', studentId)
    .eq('chapter_id', chapterId)
    .maybeSingle();
  if (existingRes.error) {
    return { ok: false, status: 500, error: publicDbError(existingRes.error) };
  }
  const existing =
    (existingRes.data as { answers: Record<string, string> | null } | null)?.answers ?? {};

  // Answers are final once submitted in the quiz UI, so a late or retried
  // save that carries FEWER answers than what is already stored must never
  // erase the newer ones: merge. The incoming snapshot wins (unless
  // `keepExisting`), and answers for questions outside the attempt are dropped.
  const merged: Record<string, string> = {};
  for (const [key, choice] of Object.entries(existing)) {
    if (allowed.has(Number(key))) merged[key] = choice;
  }
  for (const [key, choice] of Object.entries(incoming)) {
    if (keepExisting && key in merged) continue;
    merged[key] = choice;
  }

  // Nothing answered yet -> nothing to continue; make sure no stale
  // row is left behind and report it.
  if (Object.keys(merged).length === 0) {
    const del = await service
      .from('chapter_quiz_progress')
      .delete()
      .eq('student_id', studentId)
      .eq('chapter_id', chapterId);
    if (del.error) return { ok: false, status: 500, error: publicDbError(del.error) };
    return { ok: true, saved: false, answered: 0, total, xpAwarded: 0, merged, existing };
  }

  const upsert = await service.from('chapter_quiz_progress').upsert(
    {
      student_id: studentId,
      chapter_id: chapterId,
      subject_id: bank[0].subject_id,
      answers: merged,
      question_ids: attemptIds,
      current_question_index: Math.min(currentQuestionIndex, total - 1),
      total_questions: total,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'student_id,chapter_id' }
  );
  if (upsert.error) return { ok: false, status: 500, error: publicDbError(upsert.error) };

  // XP for answers new in this save (migration 048: 10 XP the first time
  // a question is answered correctly, ever). Credited AFTER the upsert so
  // the row's started_at precedes the award and the submit-time accuracy
  // bonus counts it as earned in this attempt.
  const newAnswers: Record<string, string> = {};
  for (const key of Object.keys(incoming)) {
    if (!(key in existing)) newAnswers[key] = merged[key];
  }
  const xpAwarded = await awardAnswersXp(service, studentId, newAnswers);

  return {
    ok: true,
    saved: true,
    answered: Object.keys(merged).length,
    total,
    xpAwarded,
    merged,
    existing,
  };
}
