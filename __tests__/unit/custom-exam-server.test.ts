import {
  chunk,
  drawQuestionIds,
  mergeExamAnswers,
  orderByIds,
  scoreExam,
} from '@/lib/server/custom-exam';

describe('chunk', () => {
  test('splits into slices of at most `size`, keeping order', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([1, 2, 3, 4], 2)).toEqual([[1, 2], [3, 4]]);
  });

  test('empty input gives no chunks; oversize chunk gives one', () => {
    expect(chunk([], 3)).toEqual([]);
    expect(chunk([1, 2], 10)).toEqual([[1, 2]]);
  });

  test('rejects a non-positive size instead of looping forever', () => {
    expect(() => chunk([1], 0)).toThrow(RangeError);
    expect(() => chunk([1], -2)).toThrow(RangeError);
    expect(() => chunk([1], 1.5)).toThrow(RangeError);
  });
});

describe('orderByIds', () => {
  const rows = [
    { id: 3, v: 'c' },
    { id: 1, v: 'a' },
    { id: 2, v: 'b' },
  ];

  test('returns rows in the order of the given ids', () => {
    expect(orderByIds(rows, [2, 3, 1]).map((r) => r.v)).toEqual(['b', 'c', 'a']);
  });

  test('skips ids with no row (e.g. unpublished since) and keeps the rest in order', () => {
    expect(orderByIds(rows, [9, 1, 8, 2]).map((r) => r.id)).toEqual([1, 2]);
  });

  test('a repeated id yields the row once', () => {
    expect(orderByIds(rows, [1, 1, 2]).map((r) => r.id)).toEqual([1, 2]);
  });
});

/** Deterministic rand: cycles through the given values in [0, 1). */
function seq(...values: number[]) {
  let i = 0;
  return () => values[i++ % values.length];
}

describe('drawQuestionIds', () => {
  const pool = [11, 12, 13, 14, 15, 16, 17, 18, 19, 20];

  test('returns exactly `count` distinct ids, all from the pool', () => {
    const drawn = drawQuestionIds(pool, 6);
    expect(drawn).toHaveLength(6);
    expect(new Set(drawn).size).toBe(6);
    for (const id of drawn) expect(pool).toContain(id);
  });

  test('drawing the whole pool returns every id once, in some order', () => {
    const drawn = drawQuestionIds(pool, pool.length);
    expect([...drawn].sort((a, b) => a - b)).toEqual(pool);
  });

  test('does not mutate the pool it was given', () => {
    const copy = [...pool];
    drawQuestionIds(pool, 4);
    expect(pool).toEqual(copy);
  });

  test('is deterministic for a given rand (so it is testable)', () => {
    const a = drawQuestionIds(pool, 5, seq(0.1, 0.9, 0.5, 0.3, 0.7));
    const b = drawQuestionIds(pool, 5, seq(0.1, 0.9, 0.5, 0.3, 0.7));
    expect(a).toEqual(b);
  });

  test('collapses duplicate ids in the pool before drawing', () => {
    const drawn = drawQuestionIds([1, 1, 2, 2, 3], 3);
    expect([...drawn].sort()).toEqual([1, 2, 3]);
  });

  test('refuses to draw more than the pool holds', () => {
    expect(() => drawQuestionIds([1, 2, 3], 4)).toThrow(RangeError);
    expect(() => drawQuestionIds([1, 1, 1], 2)).toThrow(RangeError);
  });

  test('refuses a non-positive or non-integer count', () => {
    expect(() => drawQuestionIds(pool, 0)).toThrow(RangeError);
    expect(() => drawQuestionIds(pool, -1)).toThrow(RangeError);
    expect(() => drawQuestionIds(pool, 2.5)).toThrow(RangeError);
  });

  test('actually shuffles (not always the pool prefix)', () => {
    // rand() = 0 always swaps with index 0 — result must differ from the plain prefix.
    const drawn = drawQuestionIds(pool, pool.length, () => 0);
    expect(drawn).not.toEqual(pool);
  });
});

describe('scoreExam', () => {
  const questions = [
    { id: 1, correct_answer: 'a' },
    { id: 2, correct_answer: 'b' },
    { id: 3, correct_answer: 'c' },
    { id: 4, correct_answer: 'd' },
  ];

  test('scores against the canonical key, keeping the exam order', () => {
    const out = scoreExam(questions, { '1': 'a', '2': 'x', '3': 'c' });
    expect(out.score).toBe(2);
    expect(out.total).toBe(4);
    expect(out.results.map((r) => r.questionId)).toEqual([1, 2, 3, 4]);
    expect(out.results[1]).toEqual({ questionId: 2, chosen: 'x', correct: 'b', isCorrect: false });
  });

  test('a skipped question is wrong and counts against accuracy', () => {
    const out = scoreExam(questions, { '1': 'a' });
    expect(out.results[3]).toEqual({ questionId: 4, chosen: null, correct: 'd', isCorrect: false });
    expect(out.accuracy).toBe(25);
  });

  test('accuracy has two decimals over the whole exam', () => {
    const three = questions.slice(0, 3);
    expect(scoreExam(three, { '1': 'a' }).accuracy).toBe(33.33);
    expect(scoreExam(three, { '1': 'a', '2': 'b', '3': 'c' }).accuracy).toBe(100);
  });

  test('ignores answers for questions that are not part of the exam', () => {
    const out = scoreExam(questions, { '1': 'a', '999': 'a' });
    expect(out.score).toBe(1);
    expect(out.total).toBe(4);
  });

  test('an empty exam scores zero without dividing by zero', () => {
    expect(scoreExam([], {})).toEqual({ results: [], score: 0, total: 0, accuracy: 0 });
  });
});

describe('mergeExamAnswers', () => {
  const allowed = new Set([1, 2, 3]);

  test('incoming answers win over stored ones', () => {
    expect(mergeExamAnswers({ '1': 'a' }, { '1': 'b', '2': 'c' }, allowed)).toEqual({
      '1': 'b',
      '2': 'c',
    });
  });

  test('a late save with FEWER answers never erases newer ones', () => {
    expect(mergeExamAnswers({ '1': 'a', '2': 'b' }, { '1': 'a' }, allowed)).toEqual({
      '1': 'a',
      '2': 'b',
    });
  });

  test('drops ids that are not part of this exam, from both sides', () => {
    expect(mergeExamAnswers({ '9': 'a', '1': 'a' }, { '8': 'z', '2': 'b' }, allowed)).toEqual({
      '1': 'a',
      '2': 'b',
    });
  });

  test('drops non-integer keys', () => {
    expect(mergeExamAnswers({}, { foo: 'a', '1.5': 'b', '1': 'c' }, allowed)).toEqual({ '1': 'c' });
  });

  test('returns {} when nothing valid remains', () => {
    expect(mergeExamAnswers(null, {}, allowed)).toEqual({});
  });
});
