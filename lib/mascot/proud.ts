import { pick } from '@/lib/mascot/copy';
import type { PoseId } from '@/lib/mascot/poses';

/**
 * What Bueno is proudest of on the Progress page, chosen from the student's real
 * numbers. The first rule that fires wins, so the message is always the most
 * impressive true thing we can say; there is no fake praise.
 */
export type ProudInput = {
  totalQuestionsAnswered: number;
  /** 0-100. */
  overallAccuracy: number;
  streakDays: number;
  /** Per-session accuracy, oldest first. */
  progressHistory: { accuracy: number }[];
  mistakesToReview: number;
};

export type ProudKind = 'first' | 'streak' | 'trend' | 'accuracy' | 'volume' | 'steady';

export type ProudMessage = {
  kind: ProudKind;
  pose: PoseId;
  headline: string;
  body: string;
};

export const VOLUME_MILESTONES = [100, 250, 500, 1000, 2500, 5000] as const;

/** Average of the last 3 sessions minus the 3 before them; null if there are fewer than 6. */
export function accuracyTrend(history: { accuracy: number }[]): number | null {
  if (history.length < 6) return null;
  const avg = (xs: { accuracy: number }[]) => xs.reduce((s, p) => s + p.accuracy, 0) / xs.length;
  return avg(history.slice(-3)) - avg(history.slice(-6, -3));
}

export function largestVolumeMilestone(total: number): number | null {
  let best: number | null = null;
  for (const m of VOLUME_MILESTONES) if (total >= m) best = m;
  return best;
}

const STEADY_BODY = [
  'Every question you answer is a bone in the right place.',
  'Steady beats fast. Keep stacking days.',
] as const;

export function pickProudMessage(i: ProudInput, seed = 0): ProudMessage {
  if (i.totalQuestionsAnswered <= 0) {
    return {
      kind: 'first',
      pose: 'rest',
      headline: 'Your story starts here',
      body: 'Take your first quiz and I will start tracking the proud moments.',
    };
  }

  if (i.streakDays >= 7) {
    return {
      kind: 'streak',
      pose: 'proud',
      headline: `${i.streakDays} days in a row!`,
      body: 'That kind of consistency is what gets people through exams.',
    };
  }

  const trend = accuracyTrend(i.progressHistory);
  if (trend !== null && trend >= 5) {
    return {
      kind: 'trend',
      pose: 'proud',
      headline: `Your accuracy is up ${Math.round(trend)}%`,
      body: 'Your last few quizzes beat the ones before them. It is working.',
    };
  }

  if (i.overallAccuracy >= 80 && i.totalQuestionsAnswered >= 50) {
    return {
      kind: 'accuracy',
      pose: 'proud',
      headline: `${Math.round(i.overallAccuracy)}% accuracy overall`,
      body: 'You really know your stuff. I am not crying, skulls cannot.',
    };
  }

  const milestone = largestVolumeMilestone(i.totalQuestionsAnswered);
  if (milestone !== null) {
    return {
      kind: 'volume',
      pose: 'proud',
      headline: `${i.totalQuestionsAnswered.toLocaleString('en-US')} questions answered`,
      body: `Past ${milestone.toLocaleString('en-US')} already. That is real work.`,
    };
  }

  return {
    kind: 'steady',
    pose: 'proud',
    headline: 'Proud of your progress',
    body: pick(STEADY_BODY, seed),
  };
}
