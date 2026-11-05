import { addDays } from '@/lib/streak-date';
import {
  computeStreakState,
  RESCUE_QUESTION_TARGET,
  type StreakState,
} from '@/lib/streak-state';
import { streakOutcome, type StreakOutcome } from '@/lib/mascot/streak-outcome';

/**
 * Database side of the mascot's streak features. Every function takes the
 * client as a parameter and is scoped by `userId`: callers pass the SERVICE
 * client (RLS does not apply to it), so they must have authenticated the user
 * first, exactly like the neighbouring streak routes.
 *
 * `db` is an untyped `{ from() }` (see `untypedFrom`): the generated Database
 * type doesn't propagate into `.from()` builders in this codebase.
 */
export type StreakDb = { from: (table: string) => any };

/** How far back to look for active days. A streak longer than this is capped, which is fine. */
export const STREAK_LOOKBACK_DAYS = 400;

type QueryError = { message: string } | null;

/** Days on which the student completed at least one quiz (the streak rule). */
export async function fetchActiveDates(db: StreakDb, userId: string, today: string): Promise<string[]> {
  const from = addDays(today, -STREAK_LOOKBACK_DAYS);
  const { data, error } = (await db
    .from('daily_streaks')
    .select('streak_date')
    .eq('student_id', userId)
    .gt('challenges_completed', 0)
    .gte('streak_date', from)) as { data: { streak_date: string }[] | null; error: QueryError };
  if (error) throw new Error(`daily_streaks read failed: ${error.message}`);
  return (data ?? []).map((r) => r.streak_date);
}

/** Local-midnight bounds of a 'YYYY-MM-DD' day, the same clock `todayISODate` uses. */
function dayBounds(day: string): { start: string; end: string } {
  const [y, m, d] = day.split('-').map(Number);
  return {
    start: new Date(y, m - 1, d).toISOString(),
    end: new Date(y, m - 1, d + 1).toISOString(),
  };
}

/** Questions the student answered in quizzes completed on `today` (chapter quizzes and custom exams). */
export async function countQuestionsAnsweredOn(db: StreakDb, userId: string, today: string): Promise<number> {
  const { start, end } = dayBounds(today);
  const { data, error } = (await db
    .from('quiz_sessions')
    .select('answers,total_questions')
    .eq('student_id', userId)
    .gte('completed_at', start)
    .lt('completed_at', end)) as {
    data: { answers: unknown; total_questions: number }[] | null;
    error: QueryError;
  };
  if (error) throw new Error(`quiz_sessions read failed: ${error.message}`);
  let total = 0;
  for (const row of data ?? []) {
    const ceiling = Math.max(0, row.total_questions ?? 0);
    const picked =
      row.answers && typeof row.answers === 'object' ? Object.keys(row.answers as object).length : ceiling;
    total += Math.min(picked, ceiling);
  }
  return total;
}

export type MascotStatus = {
  today: string;
  state: StreakState;
  rescue: { answeredToday: number; target: number };
};

export async function getMascotStatus(db: StreakDb, userId: string, today: string): Promise<MascotStatus> {
  const state = computeStreakState(await fetchActiveDates(db, userId, today), today);
  // The answered-today count only matters while a rescue is on the table.
  const answeredToday = state.rescueEligible ? await countQuestionsAnsweredOn(db, userId, today) : 0;
  return { today, state, rescue: { answeredToday, target: RESCUE_QUESTION_TARGET } };
}

/**
 * If the student missed exactly yesterday (after a real streak) and has now
 * answered the target number of questions today, backfill yesterday so the old
 * streak is genuinely restored. Idempotent: it writes nothing unless a rescue is
 * currently eligible, and the upsert ignores a row that already exists.
 */
export async function applyStreakRescueIfEarned(db: StreakDb, userId: string, today: string): Promise<boolean> {
  const state = computeStreakState(await fetchActiveDates(db, userId, today), today);
  if (!state.rescueEligible) return false;
  if ((await countQuestionsAnsweredOn(db, userId, today)) < RESCUE_QUESTION_TARGET) return false;

  const { error } = (await db.from('daily_streaks').upsert(
    {
      student_id: userId,
      streak_date: addDays(today, -1),
      challenges_completed: 1,
    },
    { onConflict: 'student_id,streak_date', ignoreDuplicates: true }
  )) as { error: QueryError };
  if (error) throw new Error(`streak rescue write failed: ${error.message}`);
  return true;
}

/** State before a submission is recorded; null if it couldn't be read (never blocks the submit). */
export async function snapshotBeforeSubmit(db: StreakDb, userId: string, today: string): Promise<StreakState | null> {
  try {
    return computeStreakState(await fetchActiveDates(db, userId, today), today);
  } catch (err) {
    console.error('[streak-status] snapshot before submit failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Call AFTER the quiz result is recorded: applies the rescue if it was just
 * earned, then reports what the submission did to the streak. Returns null on
 * any failure: the mascot is a bonus and must never break a quiz submission.
 */
export async function buildStreakOutcome(
  db: StreakDb,
  userId: string,
  today: string,
  before: StreakState | null
): Promise<StreakOutcome | null> {
  if (!before) return null;
  try {
    const rescued = await applyStreakRescueIfEarned(db, userId, today);
    const after = computeStreakState(await fetchActiveDates(db, userId, today), today);
    return streakOutcome(before, after, rescued);
  } catch (err) {
    console.error('[streak-status] building streak outcome failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

/** Accuracy of the student's previous completed attempt in a chapter (before the one being recorded). */
export async function previousChapterAccuracy(db: StreakDb, userId: string, chapterId: string): Promise<number | null> {
  try {
    const { data, error } = (await db
      .from('quiz_sessions')
      .select('accuracy')
      .eq('student_id', userId)
      .eq('chapter_id', chapterId)
      .order('completed_at', { ascending: false })
      .limit(1)) as { data: { accuracy: number }[] | null; error: QueryError };
    if (error || !data || data.length === 0) return null;
    const a = Number(data[0].accuracy);
    return Number.isFinite(a) ? a : null;
  } catch {
    return null;
  }
}
