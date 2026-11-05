import { pick, seedFromString } from '@/lib/mascot/copy';
import type { PoseId } from '@/lib/mascot/poses';
import type { StreakState } from '@/lib/streak-state';

/**
 * Decides what (if anything) Bueno says when a student opens the app.
 *
 * - at most one greeting per day per slot, tracked by server date;
 * - a student who already practised today gets only a quiet peace-sign card
 *   (a reward, not a nag);
 * - in the evening a student whose streak still needs today's quiz gets one
 *   extra "at risk" nudge, even if the morning greeting was already shown.
 */
export type GreetingKind =
  | 'welcome'
  | 'streak-alive'
  | 'rescue'
  | 'fresh-start'
  | 'done-quiet'
  | 'evening-risk';

export type GreetingSlot = 'daily' | 'evening';

/** The server dates on which each slot was last shown on this device. */
export type SeenGreetings = { daily?: string | null; evening?: string | null };

export type RescueProgress = { answeredToday: number; target: number };

export type Greeting = {
  kind: GreetingKind;
  /** Slots to mark as seen once the greeting is on screen. */
  marks: GreetingSlot[];
  pose: PoseId;
  headline: string;
  body: string;
  cta: { label: string; href: string } | null;
  /** Rescue meter, only for the two kinds that talk about the rescue. */
  progress: { done: number; total: number } | null;
};

export type GreetingInput = {
  state: StreakState;
  rescue: RescueProgress;
  /** The student's local hour, 0-23. */
  localHour: number;
  seen: SeenGreetings;
};

/** From this local hour on, a streak that still needs today's quiz is "at risk". */
export const EVENING_HOUR = 19;

const CATALOGUE = '/student/catalogue';

const WELCOME_BODY = [
  'Take your first quiz and start a streak. I will be cheering from the corner.',
  'One quiz starts your streak. I will keep count of the bones.',
] as const;

const FRESH_BODY = [
  'One quiz is all it takes to start a new streak.',
  'Every streak starts with a single quiz. Today works.',
] as const;

const ALIVE_BODY = [
  'Do one quiz today to keep it going.',
  'One quiz keeps the chain unbroken. Do not let it turn to dust.',
] as const;

function dayLabel(n: number): string {
  return n === 1 ? '1-day' : `${n}-day`;
}

export function decideGreeting(input: GreetingInput): Greeting | null {
  const { state, rescue, localHour, seen } = input;
  const today = state.today;
  const dailySeen = seen.daily === today;
  const eveningSeen = seen.evening === today;
  const seed = seedFromString(today);
  const rescueProgress = { done: Math.min(rescue.answeredToday, rescue.target), total: rescue.target };

  if (state.doneToday) {
    if (dailySeen) return null;
    return {
      kind: 'done-quiet',
      marks: ['daily'],
      pose: 'peace',
      headline: "Today's streak is locked in",
      body: 'Anything extra is a bonus. Peace.',
      cta: null,
      progress: null,
    };
  }

  const streakAtRisk = state.currentStreak > 0 || state.rescueEligible;

  if (localHour >= EVENING_HOUR && streakAtRisk) {
    if (eveningSeen) return null;
    if (state.rescueEligible) {
      return {
        kind: 'evening-risk',
        marks: ['daily', 'evening'],
        pose: 'worried',
        headline: `Still time to save your ${dayLabel(state.previousStreak)} streak`,
        body: `Answer ${rescue.target} questions today to win back the day you missed.`,
        cta: { label: 'Start answering', href: CATALOGUE },
        progress: rescueProgress,
      };
    }
    return {
      kind: 'evening-risk',
      marks: ['daily', 'evening'],
      pose: 'worried',
      headline: `Your ${dayLabel(state.currentStreak)} streak still needs today's quiz`,
      body: 'One quiz and it is safe.',
      cta: { label: 'Start a quiz', href: CATALOGUE },
      progress: null,
    };
  }

  if (dailySeen) return null;

  if (!state.everActive) {
    return {
      kind: 'welcome',
      marks: ['daily'],
      pose: 'rest',
      headline: "Hi, I'm Bueno!",
      body: pick(WELCOME_BODY, seed),
      cta: { label: 'Start a quiz', href: CATALOGUE },
      progress: null,
    };
  }

  if (state.rescueEligible) {
    return {
      kind: 'rescue',
      marks: ['daily'],
      pose: 'worried',
      headline: `Your ${dayLabel(state.previousStreak)} streak is hanging by a bone`,
      body: `You missed yesterday. Answer ${rescue.target} questions today to restore it.`,
      cta: { label: 'Start answering', href: CATALOGUE },
      progress: rescueProgress,
    };
  }

  if (state.currentStreak > 0) {
    return {
      kind: 'streak-alive',
      marks: ['daily'],
      pose: 'rest',
      headline: `${dayLabel(state.currentStreak)} streak. Make it ${state.currentStreak + 1}!`,
      body: pick(ALIVE_BODY, seed),
      cta: { label: 'Start a quiz', href: CATALOGUE },
      progress: null,
    };
  }

  return {
    kind: 'fresh-start',
    marks: ['daily'],
    pose: 'rest',
    headline: 'Fresh start',
    body: pick(FRESH_BODY, seed),
    cta: { label: 'Start a quiz', href: CATALOGUE },
    progress: null,
  };
}
