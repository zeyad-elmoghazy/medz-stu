import { tierForAccuracy, FLAT_LINE, ANGRY_LINE } from '@/lib/mascot/tiers';
import { milestoneFor, STREAK_MILESTONES } from '@/lib/mascot/milestones';

describe('tierForAccuracy', () => {
  it.each([
    [0, 'angry'],
    [30, 'angry'],
    [49, 'angry'],
    [50, 'flat'],
    [60, 'flat'],
    [74, 'flat'],
    [75, 'thumbs'],
    [80, 'thumbs'],
    [89, 'thumbs'],
    [90, 'flex'],
    [95, 'flex'],
    [99, 'flex'],
    [100, 'perfect'],
  ])('%i%% -> %s', (accuracy, tier) => {
    expect(tierForAccuracy(accuracy)).toBe(tier);
  });

  it('uses the exact wording the product specifies', () => {
    expect(FLAT_LINE).toBe('You can do better.');
    expect(ANGRY_LINE).toBe('Go Study.');
  });
});

describe('milestoneFor', () => {
  it('only exact milestone lengths get a celebration', () => {
    for (const days of STREAK_MILESTONES) expect(milestoneFor(days)).not.toBeNull();
    for (const days of [0, 1, 2, 4, 6, 8, 13, 15, 29, 31, 99, 101]) {
      expect(milestoneFor(days)).toBeNull();
    }
  });

  it('gives a party hat, and a graduation cap at 100 days', () => {
    expect(milestoneFor(7)).toEqual({ days: 7, accessory: 'partyHat' });
    expect(milestoneFor(30)).toEqual({ days: 30, accessory: 'partyHat' });
    expect(milestoneFor(100)).toEqual({ days: 100, accessory: 'gradCap' });
  });
});
