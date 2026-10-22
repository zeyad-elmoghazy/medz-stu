import {
  scoreExamProgress,
  type ExamProgressRow,
} from '@/lib/server/custom-exam-progress';

const row = (over: Partial<ExamProgressRow> = {}): ExamProgressRow => ({
  id: 'exam-1',
  module_code: '205',
  chapter_ids: ['c1', 'c2', 'c3'],
  answers: {},
  total_questions: 20,
  updated_at: '2026-10-22T10:00:00.000Z',
  ...over,
});

describe('scoreExamProgress', () => {
  const key = new Map<number, string>([
    [1, 'a'],
    [2, 'b'],
    [3, 'c'],
  ]);

  test('counts answered and correct against the answer key', () => {
    const item = scoreExamProgress(row({ answers: { '1': 'a', '2': 'x', '3': 'c' } }), key);
    expect(item).toEqual({
      examId: 'exam-1',
      moduleCode: '205',
      chapterCount: 3,
      answered: 3,
      correct: 2,
      total: 20,
      updatedAt: '2026-10-22T10:00:00.000Z',
    });
  });

  test('ignores answers for questions no longer in the bank', () => {
    const item = scoreExamProgress(row({ answers: { '1': 'a', '99': 'a' } }), key);
    expect(item?.answered).toBe(1);
    expect(item?.correct).toBe(1);
  });

  test('is null when nothing countable has been answered', () => {
    expect(scoreExamProgress(row({ answers: {} }), key)).toBeNull();
    expect(scoreExamProgress(row({ answers: { '99': 'a' } }), key)).toBeNull();
    expect(scoreExamProgress(row({ answers: null }), key)).toBeNull();
  });

  test('total is never smaller than the number answered', () => {
    const item = scoreExamProgress(
      row({ total_questions: 1, answers: { '1': 'a', '2': 'b' } }),
      key
    );
    expect(item?.total).toBe(2);
  });
});
