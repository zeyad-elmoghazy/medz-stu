import 'server-only';

/**
 * XP crediting (supabase/migrations/048_xp_per_answer.sql). All three
 * functions are SECURITY DEFINER and executable by the service role only,
 * so `client` must be a service-role Supabase client.
 *
 * - awardAnswersXp: called by the progress PUT routes on every save.
 *   10 XP per question the student answers correctly for the FIRST time
 *   ever (xp_awards primary key); repeats, wrong and unpublished answers
 *   earn 0. Idempotent, so sending already-credited answers is harmless.
 * - finishAttemptXp: called at submit. Credits answers whose live save was
 *   lost, adds the 90%-accuracy bonus (+50% of XP newly earned since
 *   `since`), and returns the attempt's total XP for the results screen.
 * - recordQuizStats: streak + answer counters, no XP.
 *
 * Failures are logged and reported as 0 XP — XP must never block saving
 * progress or finishing a quiz.
 */

type RpcClient = {
  rpc: (
    name: string,
    args: Record<string, unknown>
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

function toArrays(answers: Record<string, string>) {
  const ids: number[] = [];
  const choices: string[] = [];
  for (const [key, choice] of Object.entries(answers)) {
    const id = Number(key);
    if (Number.isInteger(id)) {
      ids.push(id);
      choices.push(choice);
    }
  }
  return { ids, choices };
}

async function callXpRpc(client: unknown, name: string, args: Record<string, unknown>) {
  const { data, error } = await (client as RpcClient).rpc(name, args);
  if (error) {
    console.error(`[xp] ${name} failed:`, error.message);
    return 0;
  }
  return typeof data === 'number' ? data : 0;
}

export async function awardAnswersXp(
  client: unknown,
  studentId: string,
  answers: Record<string, string>
): Promise<number> {
  const { ids, choices } = toArrays(answers);
  if (ids.length === 0) return 0;
  return callXpRpc(client, 'award_answers_xp', {
    p_student_id: studentId,
    p_question_ids: ids,
    p_choices: choices,
  });
}

export async function finishAttemptXp(
  client: unknown,
  studentId: string,
  answers: Record<string, string>,
  since: string,
  accuracy: number
): Promise<number> {
  const { ids, choices } = toArrays(answers);
  return callXpRpc(client, 'finish_attempt_xp', {
    p_student_id: studentId,
    p_question_ids: ids,
    p_choices: choices,
    p_since: since,
    p_accuracy: accuracy,
  });
}

export async function recordQuizStats(
  client: unknown,
  studentId: string,
  correct: number,
  total: number,
  streakDate: string
): Promise<void> {
  const { error } = await (client as RpcClient).rpc('record_quiz_stats', {
    p_student_id: studentId,
    p_correct_count: correct,
    p_total_count: total,
    p_streak_date: streakDate,
  });
  if (error) console.error('[xp] record_quiz_stats failed:', error.message);
}
