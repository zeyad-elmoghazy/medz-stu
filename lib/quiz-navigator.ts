/**
 * State of the "question navigator" shown on the quiz pages: one status per
 * question, derived from what the student has answered so far.
 *
 * The student may revisit any answered question and the first unanswered one
 * (the one they would reach with "Next"), but not skip further ahead. Answers
 * are final, so a revisited question is review only.
 */

export type NavStatus =
  /** answered, and the verdict is known to be right */
  | 'correct'
  /** answered, and the verdict is known to be wrong */
  | 'incorrect'
  /** answered, but the verdict has not arrived yet (resume, slow connection) */
  | 'answered'
  /** the first unanswered question: where "Next" would lead */
  | 'open'
  /** unanswered and beyond the open one: can't be visited yet */
  | 'locked';

export type NavigatorState = {
  /** One status per question, in quiz order. */
  statuses: NavStatus[];
  /** Questions in the list that have an answer. */
  answeredCount: number;
  /** Index of the last answered question (0 when nothing is answered). */
  furthestIndex: number;
};

export function isJumpable(status: NavStatus): boolean {
  return status !== 'locked';
}

export function navigatorState(
  questions: ReadonlyArray<{ id: number }>,
  answers: Readonly<Record<number, string>>,
  reveals: Readonly<Record<string, { correctAnswer: string }>>
): NavigatorState {
  let answeredCount = 0;
  let furthestIndex = 0;
  let openTaken = false;

  const statuses = questions.map((q, i): NavStatus => {
    const chosen = answers[q.id];
    if (chosen == null) {
      if (openTaken) return 'locked';
      openTaken = true;
      return 'open';
    }
    answeredCount += 1;
    furthestIndex = i;
    const reveal = reveals[q.id];
    if (!reveal) return 'answered';
    return reveal.correctAnswer === chosen ? 'correct' : 'incorrect';
  });

  return { statuses, answeredCount, furthestIndex };
}
