import {
  EXAM_SCHEDULE,
  cairoToday,
  daysUntil,
  examDateFor,
  hasExamDates,
} from '@/lib/exam-schedule';

describe('EXAM_SCHEDULE (the placeholders)', () => {
  it('ships with no dates, so the countdown stays hidden until the owner fills them in', () => {
    expect(Object.values(EXAM_SCHEDULE.byYear).every((d) => d === null)).toBe(true);
    expect(EXAM_SCHEDULE.byModule).toEqual({});
    for (const year of [1, 2, 3, 4, 5]) {
      expect(examDateFor(year, '205')).toBeNull();
    }
  });
});

describe('examDateFor', () => {
  const schedule = {
    byYear: { 1: null, 2: '2026-11-27', 3: '2026-12-19' },
    byModule: { '205': '2026-12-02', '210': null },
  };

  it('uses the year date when the module has no override', () => {
    expect(examDateFor(2, '201', schedule)).toBe('2026-11-27');
  });

  it('lets a module override its year', () => {
    expect(examDateFor(2, '205', schedule)).toBe('2026-12-02');
  });

  it('falls back to the year when the override is null', () => {
    expect(examDateFor(2, '210', schedule)).toBe('2026-11-27');
  });

  it('returns null when neither is set', () => {
    expect(examDateFor(1, '101', schedule)).toBeNull();
    expect(examDateFor(5, '501', schedule)).toBeNull();
  });

  it('ignores a malformed or impossible date instead of showing a wrong countdown', () => {
    const bad = { byYear: { 2: '27/11/2026', 3: '2026-13-45' }, byModule: {} };
    expect(examDateFor(2, 'x', bad)).toBeNull();
    expect(examDateFor(3, 'x', bad)).toBeNull();
  });
});

describe('hasExamDates', () => {
  it('is false for the shipped placeholders', () => {
    for (const year of [1, 2, 3, 4, 5]) expect(hasExamDates(year)).toBe(false);
  });

  it('is true when the year or any module has a valid date', () => {
    expect(hasExamDates(2, { byYear: { 2: '2026-11-27' }, byModule: {} })).toBe(true);
    expect(hasExamDates(2, { byYear: {}, byModule: { '205': '2026-12-02' } })).toBe(true);
  });

  it('ignores invalid dates', () => {
    expect(hasExamDates(2, { byYear: { 2: 'soon' }, byModule: { '205': '' } })).toBe(false);
  });
});

describe('daysUntil', () => {
  it('counts whole days, 0 on the day and negative afterwards', () => {
    expect(daysUntil('2026-11-27', '2026-11-10')).toBe(17);
    expect(daysUntil('2026-11-27', '2026-11-27')).toBe(0);
    expect(daysUntil('2026-11-27', '2026-11-28')).toBe(-1);
  });

  it('counts across a month boundary', () => {
    expect(daysUntil('2026-12-02', '2026-11-30')).toBe(2);
  });
});

describe('cairoToday', () => {
  it('is the Cairo calendar date, not the UTC one', () => {
    // 22:30 UTC on the 10th is already 00:30 on the 11th in Cairo (UTC+2).
    expect(cairoToday(new Date('2026-11-10T22:30:00Z'))).toBe('2026-11-11');
    expect(cairoToday(new Date('2026-11-10T12:00:00Z'))).toBe('2026-11-10');
  });
});
