import {
  mergeInProgressIntoSubject,
  scoreProgressRows,
  type InProgressChapter,
  type ProgressRow,
} from '@/lib/server/chapter-quiz-progress';

const row = (over: Partial<ProgressRow> = {}): ProgressRow => ({
  chapter_id: 'ch-1',
  subject_id: 'anatomy',
  answers: {},
  total_questions: 10,
  updated_at: '2026-10-19T10:00:00.000Z',
  ...over,
});

describe('scoreProgressRows', () => {
  const key = new Map<number, string>([
    [1, 'a'],
    [2, 'b'],
    [3, 'c'],
  ]);

  test('counts answered and correct against the answer key', () => {
    const [item] = scoreProgressRows([row({ answers: { '1': 'a', '2': 'x', '3': 'c' } })], key);
    expect(item).toMatchObject({
      chapterId: 'ch-1',
      subjectId: 'anatomy',
      answered: 3,
      correct: 2,
      total: 10,
      updatedAt: '2026-10-19T10:00:00.000Z',
    });
  });

  test('ignores answers for questions no longer in the bank', () => {
    const [item] = scoreProgressRows([row({ answers: { '1': 'a', '99': 'a' } })], key);
    expect(item.answered).toBe(1);
    expect(item.correct).toBe(1);
  });

  test('drops a row with nothing left to count', () => {
    expect(scoreProgressRows([row({ answers: {} })], key)).toEqual([]);
    expect(scoreProgressRows([row({ answers: { '99': 'a' } })], key)).toEqual([]);
    expect(scoreProgressRows([row({ answers: null })], key)).toEqual([]);
  });

  test('total is never smaller than the number answered', () => {
    const [item] = scoreProgressRows(
      [row({ total_questions: 1, answers: { '1': 'a', '2': 'b' } })],
      key
    );
    expect(item.total).toBe(2);
  });

  test('scores each chapter row separately', () => {
    const items = scoreProgressRows(
      [
        row({ chapter_id: 'ch-1', answers: { '1': 'a' } }),
        row({ chapter_id: 'ch-2', subject_id: 'histology', answers: { '2': 'z' } }),
      ],
      key
    );
    expect(items.map((i) => [i.chapterId, i.answered, i.correct])).toEqual([
      ['ch-1', 1, 1],
      ['ch-2', 1, 0],
    ]);
  });
});

describe('mergeInProgressIntoSubject', () => {
  const item = (answered: number, correct: number): InProgressChapter => ({
    chapterId: 'ch',
    subjectId: 'anatomy',
    answered,
    correct,
    total: 20,
    updatedAt: '2026-10-19T10:00:00.000Z',
  });

  test('no completed attempts yet: totals and accuracy come from the unfinished chapter', () => {
    expect(mergeInProgressIntoSubject(undefined, [item(4, 3)])).toEqual({
      totalAnswered: 4,
      totalCorrect: 3,
      avgAccuracy: 75,
    });
  });

  test('adds to completed attempts and averages accuracy per attempt', () => {
    const base = { total_sessions: 2, total_correct: 16, total_answered: 20, avg_accuracy: 80 };
    // (80*2 + 50) / 3 = 70
    expect(mergeInProgressIntoSubject(base, [item(2, 1)])).toEqual({
      totalAnswered: 22,
      totalCorrect: 17,
      avgAccuracy: 70,
    });
  });

  test('several unfinished chapters each count as one attempt', () => {
    const merged = mergeInProgressIntoSubject(undefined, [item(2, 2), item(2, 0)]);
    expect(merged.totalAnswered).toBe(4);
    expect(merged.totalCorrect).toBe(2);
    expect(merged.avgAccuracy).toBe(50);
  });

  test('nothing unfinished leaves the completed numbers unchanged', () => {
    const base = { total_sessions: 3, total_correct: 9, total_answered: 12, avg_accuracy: 75 };
    expect(mergeInProgressIntoSubject(base, [])).toEqual({
      totalAnswered: 12,
      totalCorrect: 9,
      avgAccuracy: 75,
    });
  });

  test('nothing at all yields zeros, not NaN', () => {
    expect(mergeInProgressIntoSubject(undefined, [])).toEqual({
      totalAnswered: 0,
      totalCorrect: 0,
      avgAccuracy: 0,
    });
  });
});
