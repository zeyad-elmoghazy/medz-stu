import { ANGRY_LINE, FLAT_LINE, type ResultTier } from '@/lib/mascot/tiers';

/**
 * Everything Bueno says. Banks are plain arrays picked from with a seed, so
 * the choice is deterministic in tests and varied at runtime (callers pass
 * Math.random-derived or date-derived seeds).
 */
export type Bank = readonly string[];

/** Deterministic pick: wraps, and tolerates negative or fractional seeds. */
export function pick<T>(bank: readonly T[], seed: number): T {
  if (bank.length === 0) throw new Error('pick() needs a non-empty bank');
  return bank[Math.abs(Math.floor(seed)) % bank.length];
}

/** Small stable hash so a string (e.g. today's date) can seed `pick`. */
export function seedFromString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

// ---------------------------------------------------------------- results

/**
 * `main` is the headline next to Bueno. For the two low tiers it holds ONLY the
 * exact wording the product specifies; the personality goes in `sub`.
 */
export const RESULT_COPY: Record<ResultTier, { main: Bank; sub: Bank }> = {
  perfect: {
    main: ['Perfect score!', '100%. Flawless.', 'Not one bone out of place.'],
    sub: [
      'The whole skeleton crew is clapping.',
      'Frame this one.',
      'Take a bow, then pick the next chapter.',
    ],
  },
  flex: {
    main: ['Strong work!', 'Look at those muscles.', 'Flexing on that chapter.'],
    sub: [
      'Biceps, triceps and a brain to match.',
      'That was humerus... and very impressive.',
      'Keep lifting.',
    ],
  },
  thumbs: {
    main: ['Nice work!', 'Solid score.', 'Thumbs up from me.'],
    sub: [
      'A little polish and you hit the top tier.',
      "You've got the backbone for this.",
      'Review the misses and go for 90.',
    ],
  },
  flat: {
    main: [FLAT_LINE],
    sub: [
      'Review the ones you missed and run it again.',
      'A little more revision and you will crush it.',
      "I've seen you do better.",
    ],
  },
  angry: {
    main: [ANGRY_LINE],
    sub: [
      'Open the chapter, then try again.',
      'I have a bone to pick with this score.',
      'Practice mistakes is right there. Go.',
    ],
  },
};

/** "Up 12% from your last attempt in this chapter", or null when there is nothing worth saying. */
export function improvementLine(previous: number | null | undefined, now: number): string | null {
  if (previous === null || previous === undefined || !Number.isFinite(previous)) return null;
  const diff = Math.round(now - previous);
  if (diff >= 5) return `Up ${diff}% from your last attempt in this chapter.`;
  if (diff <= -5) return `Down ${Math.abs(diff)}% from your last attempt here. You can take it back.`;
  return null;
}

// ----------------------------------------------------------------- streak

export type StreakCelebrationInput = {
  streak: number;
  rescued: boolean;
  /** Days of the milestone reached, if any. */
  milestoneDays: number | null;
};

export function streakCelebrationCopy(i: StreakCelebrationInput): { headline: string; sub: string } {
  if (i.rescued) {
    return {
      headline: 'Streak saved!',
      sub: `Your streak is back from the grave: ${i.streak} days and counting.`,
    };
  }
  if (i.milestoneDays !== null) {
    return {
      headline: `${i.milestoneDays}-day streak!`,
      sub: i.milestoneDays >= 100 ? 'A hundred days. You officially graduate.' : 'Party time. That is a real milestone.',
    };
  }
  if (i.streak <= 1) {
    return { headline: 'Streak started!', sub: 'Come back tomorrow to make it 2.' };
  }
  return { headline: `${i.streak}-day streak!`, sub: 'Another day, another bone in the chain.' };
}

// ------------------------------------------------------- peace / goodbyes

export const SAVED_EXIT_LINES: Bank = [
  'Progress saved. See you soon!',
  'All saved. Come back when you are ready.',
  'Your answers are safe with me.',
];

export const SIGNED_OUT_LINES: Bank = [
  'Peace out! Your streak is waiting.',
  'See you tomorrow. Do not ghost me.',
  'Rest up, you earned it.',
];

// ------------------------------------------------------- the poke easter egg

export const POKE_LINES: Bank = [
  "I've got a bone to pick with Question 7.",
  'Humerus, right?',
  "Don't be a skeleton in the closet. Study!",
  'Stop poking me, I am a sensitive skeleton.',
  'Spine-tingling.',
  'I would tell you a joke, but it would be a rib-tickler.',
];
