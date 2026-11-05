import { computeStreakState, RESCUE_MIN_STREAK } from '@/lib/streak-state';
import { addDays, daysBetween, todayISODate, weekdayOf } from '@/lib/streak-date';

const TODAY = '2026-11-05';
const d = (n: number) => addDays(TODAY, -n); // d(0)=today, d(1)=yesterday, ...

describe('streak-date helpers', () => {
  it('adds and subtracts days across month and year boundaries', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29'); // leap year
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31');
  });

  it('counts whole days between two dates, regardless of DST', () => {
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2);
    expect(daysBetween('2026-10-24', '2026-10-26')).toBe(2);
    expect(daysBetween('2026-11-05', '2026-11-05')).toBe(0);
    expect(daysBetween('2026-11-05', '2026-11-04')).toBe(-1);
  });

  it('knows the weekday', () => {
    expect(weekdayOf('2026-11-05')).toBe(4); // Thursday
    expect(weekdayOf('2026-11-08')).toBe(0); // Sunday
  });

  it('formats today the way the streak routes do', () => {
    expect(todayISODate(new Date(2026, 10, 5, 23, 59))).toBe('2026-11-05');
    expect(todayISODate(new Date(2026, 0, 9))).toBe('2026-01-09');
  });
});

describe('computeStreakState', () => {
  it('brand-new student: nothing ever, no streak, nothing to rescue', () => {
    const s = computeStreakState([], TODAY);
    expect(s).toMatchObject({
      currentStreak: 0,
      doneToday: false,
      everActive: false,
      daysSinceActive: null,
      previousStreak: 0,
      rescueEligible: false,
    });
    expect(s.last7).toEqual([false, false, false, false, false, false, false]);
  });

  it('alive streak, not yet done today: counts back from yesterday', () => {
    const s = computeStreakState([d(1), d(2), d(3)], TODAY);
    expect(s.currentStreak).toBe(3);
    expect(s.doneToday).toBe(false);
    expect(s.daysSinceActive).toBe(1);
    expect(s.rescueEligible).toBe(false);
    expect(s.previousStreak).toBe(0); // no gap
  });

  it('done today extends the streak by one', () => {
    const s = computeStreakState([d(0), d(1), d(2), d(3)], TODAY);
    expect(s.currentStreak).toBe(4);
    expect(s.doneToday).toBe(true);
    expect(s.daysSinceActive).toBe(0);
    expect(s.last7).toEqual([false, false, false, true, true, true, true]);
  });

  it('first ever quiz today starts a streak of 1', () => {
    const s = computeStreakState([d(0)], TODAY);
    expect(s.currentStreak).toBe(1);
    expect(s.everActive).toBe(true);
  });

  it('matches get_student_streak when only today is done after a gap', () => {
    const s = computeStreakState([d(0), d(3), d(4), d(5)], TODAY);
    expect(s.currentStreak).toBe(1);
    expect(s.previousStreak).toBe(3);
    expect(s.rescueEligible).toBe(false); // gap is 2 days (d1 and d2 missed)
  });

  it('missed exactly yesterday after a 3-day streak: rescue available', () => {
    const s = computeStreakState([d(2), d(3), d(4)], TODAY);
    expect(s.currentStreak).toBe(0);
    expect(s.previousStreak).toBe(3);
    expect(s.rescueEligible).toBe(true);
    expect(s.daysSinceActive).toBe(2);
  });

  it('rescue stays available after practising today (today is done, yesterday still missing)', () => {
    const s = computeStreakState([d(0), d(2), d(3)], TODAY);
    expect(s.currentStreak).toBe(1);
    expect(s.previousStreak).toBe(2);
    expect(s.rescueEligible).toBe(true);
  });

  it('a previous streak shorter than the minimum is not worth rescuing', () => {
    expect(RESCUE_MIN_STREAK).toBe(2);
    const s = computeStreakState([d(2)], TODAY); // one lonely day, then a miss
    expect(s.previousStreak).toBe(1);
    expect(s.rescueEligible).toBe(false);
  });

  it('missed two or more days: streak is gone and cannot be rescued', () => {
    const s = computeStreakState([d(3), d(4), d(5), d(6)], TODAY);
    expect(s.currentStreak).toBe(0);
    expect(s.previousStreak).toBe(4);
    expect(s.rescueEligible).toBe(false);
    expect(s.daysSinceActive).toBe(3);
  });

  it('once yesterday has been backfilled the rescue is no longer offered', () => {
    const s = computeStreakState([d(1), d(2), d(3)], TODAY); // the rescued shape
    expect(s.rescueEligible).toBe(false);
    expect(s.currentStreak).toBe(3);
  });

  it('works across a month and year boundary', () => {
    const s = computeStreakState(['2026-12-31', '2026-12-30', '2026-12-29'], '2027-01-01');
    expect(s.currentStreak).toBe(3);
    expect(s.doneToday).toBe(false);
  });

  it('ignores duplicate and future dates', () => {
    const s = computeStreakState([d(1), d(1), d(2), addDays(TODAY, 3)], TODAY);
    expect(s.currentStreak).toBe(2);
    expect(s.daysSinceActive).toBe(1);
  });
});
