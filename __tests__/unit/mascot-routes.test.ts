import { isQuietRoute } from '@/lib/mascot/routes';

describe('isQuietRoute', () => {
  it.each([
    '/student/quiz/chapter/abc-123',
    '/student/quiz/exam/abc-123',
    '/student/results/chapter/abc-123',
    '/student/results/exam/abc-123',
  ])('stays quiet on %s', (path) => {
    expect(isQuietRoute(path)).toBe(true);
  });

  it.each([
    '/student/dashboard',
    '/student/catalogue',
    '/student/catalogue/1/E2E/anatomy',
    '/student/exam',
    '/student/bookmarks',
    '/student/leaderboard',
    '/student/profile',
    '/login',
    '/',
  ])('may appear on %s', (path) => {
    expect(isQuietRoute(path)).toBe(false);
  });

  it('does not treat lookalike paths as quiet', () => {
    expect(isQuietRoute('/student/quizzes')).toBe(false);
    expect(isQuietRoute('/student/resultsx/1')).toBe(false);
    expect(isQuietRoute('/other/student/quiz/chapter/1')).toBe(false);
  });

  it('is false when there is no path yet', () => {
    expect(isQuietRoute(null)).toBe(false);
    expect(isQuietRoute(undefined)).toBe(false);
    expect(isQuietRoute('')).toBe(false);
  });
});
