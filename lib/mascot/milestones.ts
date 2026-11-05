/**
 * Streak milestones. Reaching one of these exact lengths gets a bigger
 * celebration: a party hat, and a graduation cap at 100 days.
 */
export const STREAK_MILESTONES = [3, 7, 14, 30, 100] as const;

export type Accessory = 'partyHat' | 'gradCap' | 'crown';

export type Milestone = {
  days: number;
  accessory: Accessory;
};

/** The milestone a streak of exactly `streakDays` lands on, or null. */
export function milestoneFor(streakDays: number): Milestone | null {
  if (!(STREAK_MILESTONES as readonly number[]).includes(streakDays)) return null;
  return { days: streakDays, accessory: streakDays >= 100 ? 'gradCap' : 'partyHat' };
}
