import { shouldCelebrate, streakOutcome } from '@/lib/mascot/streak-outcome';
import { computeStreakState } from '@/lib/streak-state';
import { addDays } from '@/lib/streak-date';

const TODAY = '2026-11-05';
const d = (n: number) => addDays(TODAY, -n);
const st = (dates: string[]) => computeStreakState(dates, TODAY);

describe('streakOutcome', () => {
  it('the first quiz of the day extends the streak', () => {
    const o = streakOutcome(st([d(1), d(2)]), st([d(0), d(1), d(2)]), false);
    expect(o).toMatchObject({ before: 2, after: 3, extended: true, rescued: false, milestoneDays: 3, today: TODAY });
    expect(o.last7[6]).toBe(true);
    expect(shouldCelebrate(o)).toBe(true);
  });

  it('a second quiz the same day does not extend anything', () => {
    const o = streakOutcome(st([d(0), d(1)]), st([d(0), d(1)]), false);
    expect(o.extended).toBe(false);
    expect(o.milestoneDays).toBeNull();
    expect(shouldCelebrate(o)).toBe(false);
  });

  it('the very first quiz ever starts a streak at 1 (no milestone)', () => {
    const o = streakOutcome(st([]), st([d(0)]), false);
    expect(o).toMatchObject({ before: 0, after: 1, extended: true, milestoneDays: null });
    expect(shouldCelebrate(o)).toBe(true);
  });

  it('after a long gap the first quiz restarts the streak at 1', () => {
    const o = streakOutcome(st([d(9), d(10)]), st([d(0), d(9), d(10)]), false);
    expect(o).toMatchObject({ before: 0, after: 1, extended: true });
  });

  it('a rescue that lands on a later quiz celebrates even though the streak was already extended', () => {
    // quiz 1 today earlier (done today), yesterday backfilled by this submission
    const before = st([d(0), d(2), d(3), d(4)]);
    const after = st([d(0), d(1), d(2), d(3), d(4)]);
    const o = streakOutcome(before, after, true);
    expect(o).toMatchObject({ before: 1, after: 5, extended: false, rescued: true });
    expect(shouldCelebrate(o)).toBe(true);
  });

  it('a rescue on the first quiz of the day is both extended and rescued', () => {
    const before = st([d(2), d(3)]);
    const after = st([d(0), d(1), d(2), d(3)]);
    expect(streakOutcome(before, after, true)).toMatchObject({ extended: true, rescued: true, after: 4 });
  });

  it('only exact milestones carry a milestone, and only when something was celebrated', () => {
    const six = [d(1), d(2), d(3), d(4), d(5), d(6)];
    expect(streakOutcome(st(six), st([d(0), ...six]), false).milestoneDays).toBe(7);
    expect(streakOutcome(st([d(0), ...six]), st([d(0), ...six]), false).milestoneDays).toBeNull();
  });

  it('shouldCelebrate is false for missing outcomes', () => {
    expect(shouldCelebrate(null)).toBe(false);
    expect(shouldCelebrate(undefined)).toBe(false);
  });
});
