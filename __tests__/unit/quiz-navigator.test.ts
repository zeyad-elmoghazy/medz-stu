import { navigatorState, isJumpable } from '@/lib/quiz-navigator';

const qs = (n: number) => Array.from({ length: n }, (_, i) => ({ id: 100 + i }));
const rev = (correctAnswer: string) => ({ correctAnswer });

describe('navigatorState', () => {
  it('nothing answered: the first question is open, the rest locked', () => {
    const s = navigatorState(qs(4), {}, {});
    expect(s.statuses).toEqual(['open', 'locked', 'locked', 'locked']);
    expect(s.answeredCount).toBe(0);
    expect(s.furthestIndex).toBe(0);
  });

  it('marks answered questions correct / incorrect and the next one open', () => {
    const s = navigatorState(
      qs(5),
      { 100: 'a', 101: 'b', 102: 'c' },
      { '100': rev('a'), '101': rev('x'), '102': rev('c') }
    );
    expect(s.statuses).toEqual(['correct', 'incorrect', 'correct', 'open', 'locked']);
    expect(s.answeredCount).toBe(3);
    expect(s.furthestIndex).toBe(2);
  });

  it('answered question whose reveal has not arrived is neutral "answered"', () => {
    const s = navigatorState(qs(3), { 100: 'a', 101: 'b' }, { '100': rev('a') });
    expect(s.statuses).toEqual(['correct', 'answered', 'open']);
  });

  it('everything answered: no open or locked question remains', () => {
    const s = navigatorState(qs(2), { 100: 'a', 101: 'b' }, { '100': rev('a'), '101': rev('b') });
    expect(s.statuses).toEqual(['correct', 'correct']);
    expect(s.answeredCount).toBe(2);
    expect(s.furthestIndex).toBe(1);
  });

  it('a gap in the answers: only the FIRST unanswered question is open', () => {
    const s = navigatorState(qs(4), { 100: 'a', 102: 'c' }, {});
    expect(s.statuses).toEqual(['answered', 'open', 'answered', 'locked']);
    expect(s.answeredCount).toBe(2);
    expect(s.furthestIndex).toBe(2);
  });

  it('ignores answers for questions that are not in the list (mistakes subset)', () => {
    const s = navigatorState(qs(2), { 100: 'a', 999: 'z' }, {});
    expect(s.answeredCount).toBe(1);
    expect(s.statuses).toEqual(['answered', 'open']);
  });

  it('empty list', () => {
    expect(navigatorState([], {}, {})).toEqual({
      statuses: [],
      answeredCount: 0,
      furthestIndex: 0,
    });
  });
});

describe('isJumpable', () => {
  it('everything except locked can be visited', () => {
    expect(isJumpable('correct')).toBe(true);
    expect(isJumpable('incorrect')).toBe(true);
    expect(isJumpable('answered')).toBe(true);
    expect(isJumpable('open')).toBe(true);
    expect(isJumpable('locked')).toBe(false);
  });
});
