import { moduleLabel } from '@/lib/dashboard-data';
import {
  FOCUS_MAX_AREAS,
  FOCUS_MIN_ATTEMPTS,
  deriveFocusAreas,
  type QuestionAttempt,
} from '@/lib/server/chapter-mistakes';

describe('moduleLabel', () => {
  test('appends a real module name', () => {
    expect(moduleLabel('205', 'Nervous & Cardiovascular Systems')).toBe(
      'Module 205 · Nervous & Cardiovascular Systems'
    );
  });

  test.each([
    ['placeholder "Module NNN"', 'Module 102'],
    ['placeholder, different case/spacing', 'module   102'],
    ['name equal to the code', '102'],
    ['empty string', ''],
    ['whitespace only', '   '],
  ])('collapses to just the code for %s', (_label, name) => {
    expect(moduleLabel('102', name)).toBe('Module 102');
  });

  test('collapses when the name is missing', () => {
    expect(moduleLabel('309', null)).toBe('Module 309');
    expect(moduleLabel('309', undefined)).toBe('Module 309');
  });

  test('keeps a real name that merely contains the word Module', () => {
    expect(moduleLabel('210', 'Module of Endocrine Systems')).toBe(
      'Module 210 · Module of Endocrine Systems'
    );
  });
});

describe('deriveFocusAreas', () => {
  let questionSeq = 0;
  // `wrong` of the `total` attempts in the chapter are wrong. Every attempt is a
  // distinct question with its own distinct topic, mirroring the real bank
  // (~1 topic per question) — the case the old per-topic grouping could not handle.
  function chapterAttempts(chapterId: string, total: number, wrong: number): QuestionAttempt[] {
    return Array.from({ length: total }, (_, i) => {
      questionSeq += 1;
      return {
        chapterId,
        questionId: questionSeq,
        chosen: i < wrong ? 'b' : 'a',
        correctAnswer: 'a',
        topic: `unique topic ${questionSeq}`,
        completedAt: '2026-10-01T10:00:00.000Z',
      };
    });
  }

  test('constants are what the UI copy promises ("at least 3 questions")', () => {
    expect(FOCUS_MIN_ATTEMPTS).toBe(3);
    expect(FOCUS_MAX_AREAS).toBe(3);
  });

  test('groups by chapter even though every question has a unique topic', () => {
    const result = deriveFocusAreas(chapterAttempts('ch-a', 4, 3));
    expect(result).toEqual([{ chapterId: 'ch-a', accuracy: 25, attempted: 4 }]);
  });

  test('drops chapters below the minimum sample', () => {
    const result = deriveFocusAreas([
      ...chapterAttempts('ch-small', FOCUS_MIN_ATTEMPTS - 1, FOCUS_MIN_ATTEMPTS - 1),
      ...chapterAttempts('ch-ok', FOCUS_MIN_ATTEMPTS, 1),
    ]);
    expect(result.map((r) => r.chapterId)).toEqual(['ch-ok']);
  });

  test('orders weakest first and caps the list', () => {
    const result = deriveFocusAreas([
      ...chapterAttempts('ch-80', 5, 1), // 80%
      ...chapterAttempts('ch-20', 5, 4), // 20%
      ...chapterAttempts('ch-50', 4, 2), // 50%
      ...chapterAttempts('ch-60', 5, 2), // 60%
    ]);
    expect(result.map((r) => r.chapterId)).toEqual(['ch-20', 'ch-50', 'ch-60']);
    expect(result).toHaveLength(FOCUS_MAX_AREAS);
  });

  test('breaks accuracy ties by the larger sample', () => {
    const result = deriveFocusAreas([
      ...chapterAttempts('ch-3', 4, 2), // 50% over 4
      ...chapterAttempts('ch-8', 8, 4), // 50% over 8
    ]);
    expect(result.map((r) => r.chapterId)).toEqual(['ch-8', 'ch-3']);
  });

  test('rounds accuracy to one decimal place', () => {
    const [only] = deriveFocusAreas(chapterAttempts('ch-third', 3, 2));
    expect(only.accuracy).toBe(33.3);
  });

  test('counts retakes of the same question as separate attempts', () => {
    const base = chapterAttempts('ch-retake', 1, 1)[0];
    const result = deriveFocusAreas([
      base,
      { ...base, completedAt: '2026-10-02T10:00:00.000Z' },
      { ...base, completedAt: '2026-10-03T10:00:00.000Z', chosen: 'a' },
    ]);
    expect(result).toEqual([{ chapterId: 'ch-retake', accuracy: 33.3, attempted: 3 }]);
  });

  test('returns nothing for no attempts', () => {
    expect(deriveFocusAreas([])).toEqual([]);
  });
});
