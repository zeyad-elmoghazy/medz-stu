import {
  calculateSessionXp,
  XP_PER_CORRECT_ANSWER,
  ACCURACY_BONUS_THRESHOLD,
  ACCURACY_BONUS_MULTIPLIER,
  DAILY_XP_CORRECT_CAP,
} from '@/lib/xp';

describe('calculateSessionXp', () => {
  test('flat rate below the accuracy bonus threshold', () => {
    const result = calculateSessionXp({
      correctCount: 5,
      accuracy: 50,
      violationsCount: 0,
      alreadyCountedToday: 0,
    });
    expect(result).toEqual({ xpEarned: 5 * XP_PER_CORRECT_ANSWER, eligibleCorrectCount: 5 });
  });

  test('bonus multiplier applies at exactly the threshold', () => {
    const result = calculateSessionXp({
      correctCount: 10,
      accuracy: ACCURACY_BONUS_THRESHOLD,
      violationsCount: 0,
      alreadyCountedToday: 0,
    });
    expect(result.xpEarned).toBe(10 * XP_PER_CORRECT_ANSWER * ACCURACY_BONUS_MULTIPLIER);
    expect(result.eligibleCorrectCount).toBe(10);
  });

  test('bonus multiplier does not apply just below the threshold', () => {
    const result = calculateSessionXp({
      correctCount: 10,
      accuracy: ACCURACY_BONUS_THRESHOLD - 0.01,
      violationsCount: 0,
      alreadyCountedToday: 0,
    });
    expect(result.xpEarned).toBe(10 * XP_PER_CORRECT_ANSWER);
  });

  test('a session with any anti-cheat violation earns zero XP, regardless of accuracy', () => {
    const result = calculateSessionXp({
      correctCount: 10,
      accuracy: 100,
      violationsCount: 1,
      alreadyCountedToday: 0,
    });
    expect(result).toEqual({ xpEarned: 0, eligibleCorrectCount: 0 });
  });

  test('zero correct answers earns zero XP', () => {
    const result = calculateSessionXp({
      correctCount: 0,
      accuracy: 0,
      violationsCount: 0,
      alreadyCountedToday: 0,
    });
    expect(result).toEqual({ xpEarned: 0, eligibleCorrectCount: 0 });
  });

  test('the daily cap clamps eligible correct answers to what remains', () => {
    const alreadyCountedToday = DAILY_XP_CORRECT_CAP - 5; // 5 left in the pool
    const result = calculateSessionXp({
      correctCount: 10,
      accuracy: 100,
      violationsCount: 0,
      alreadyCountedToday,
    });
    expect(result.eligibleCorrectCount).toBe(5);
    expect(result.xpEarned).toBe(5 * XP_PER_CORRECT_ANSWER * ACCURACY_BONUS_MULTIPLIER);
  });

  test('a session earns zero XP once the daily cap is already exhausted', () => {
    const result = calculateSessionXp({
      correctCount: 10,
      accuracy: 100,
      violationsCount: 0,
      alreadyCountedToday: DAILY_XP_CORRECT_CAP,
    });
    expect(result).toEqual({ xpEarned: 0, eligibleCorrectCount: 0 });
  });

  test('alreadyCountedToday beyond the cap never produces a negative remaining pool', () => {
    const result = calculateSessionXp({
      correctCount: 10,
      accuracy: 100,
      violationsCount: 0,
      alreadyCountedToday: DAILY_XP_CORRECT_CAP + 500,
    });
    expect(result).toEqual({ xpEarned: 0, eligibleCorrectCount: 0 });
  });

  test('xpEarned is always a non-negative integer across a spread of inputs', () => {
    const accuracies = [0, 12.5, 49.99, 90, 100];
    const corrects = [0, 1, 7, 150, 999];
    const already = [0, DAILY_XP_CORRECT_CAP - 1, DAILY_XP_CORRECT_CAP, DAILY_XP_CORRECT_CAP + 10];
    for (const accuracy of accuracies) {
      for (const correctCount of corrects) {
        for (const alreadyCountedToday of already) {
          const { xpEarned, eligibleCorrectCount } = calculateSessionXp({
            correctCount,
            accuracy,
            violationsCount: 0,
            alreadyCountedToday,
          });
          expect(Number.isInteger(xpEarned)).toBe(true);
          expect(xpEarned).toBeGreaterThanOrEqual(0);
          expect(eligibleCorrectCount).toBeGreaterThanOrEqual(0);
          expect(eligibleCorrectCount).toBeLessThanOrEqual(correctCount);
        }
      }
    }
  });
});
