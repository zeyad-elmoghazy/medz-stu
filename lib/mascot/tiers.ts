/**
 * Quiz-result reactions. The tier comes from the accuracy the results page
 * DISPLAYS (already rounded to a whole percent), so what the student reads and
 * what Bueno does can never disagree.
 *
 *   100        -> perfect (flex pose + crown)
 *   90 - 99    -> flex
 *   75 - 89    -> thumbs up
 *   50 - 74    -> straight face   "You can do better."
 *   below 50   -> arms crossed    "Go Study."
 */
export type ResultTier = 'perfect' | 'flex' | 'thumbs' | 'flat' | 'angry';

export function tierForAccuracy(roundedAccuracy: number): ResultTier {
  if (roundedAccuracy >= 100) return 'perfect';
  if (roundedAccuracy >= 90) return 'flex';
  if (roundedAccuracy >= 75) return 'thumbs';
  if (roundedAccuracy >= 50) return 'flat';
  return 'angry';
}

/** The two tiers whose exact wording the product specifies. */
export const FLAT_LINE = 'You can do better.';
export const ANGRY_LINE = 'Go Study.';
