import {
  EXAM_SCHEDULE,
  cairoToday,
  daysUntil,
  examsFor,
  hasExamDates,
} from '@/lib/exam-schedule';

describe('EXAM_SCHEDULE (the real dates)', () => {
  const codes = ['101', '102', '205', '206', '309', '310'];

  it('has an entry for every module that has an exam', () => {
    expect(Object.keys(EXAM_SCHEDULE.byModule).sort()).toEqual(codes);
  });

  it('every date is a real calendar date, so the countdown never silently drops one', () => {
    for (const code of codes) {
      const listed = EXAM_SCHEDULE.byModule[code];
      expect(examsFor(code)).toHaveLength(listed.length);
    }
  });

  it('every label names its exam', () => {
    for (const code of codes) {
      for (const exam of EXAM_SCHEDULE.byModule[code]) {
        expect(exam.label).toMatch(/^(End of Module|Final) /);
      }
    }
  });

  it('the Final comes after the End of Module exam of the same module', () => {
    for (const code of codes) {
      const exams = examsFor(code);
      if (exams.length < 2) continue;
      const end = exams.find((e) => e.label.startsWith('End of Module'))!;
      const final = exams.find((e) => e.label.startsWith('Final'))!;
      expect(daysUntil(final.date, end.date)).toBeGreaterThan(0);
    }
  });

  it('matches the dates the faculty announced', () => {
    const dates = (code: string) => examsFor(code).map((e) => e.date);
    expect(dates('101')).toEqual(['2026-12-02', '2026-12-12']);
    expect(dates('102')).toEqual(['2026-12-07', '2026-12-21']);
    expect(dates('205')).toEqual(['2026-11-16']);
    expect(dates('206')).toEqual(['2026-12-30']);
    expect(dates('310')).toEqual(['2026-12-19', '2026-12-22']);
    expect(dates('309')).toEqual(['2026-12-30', '2027-01-02']);
  });
});

describe('examsFor', () => {
  const schedule = {
    byModule: {
      '205': [
        { date: '2026-11-16', label: 'End of Module 205' },
        { date: null, label: 'Final 205' },
      ],
      '206': [{ date: '16/11/2026', label: 'Bad format' }],
      '207': [{ date: '2026-13-45', label: 'Impossible' }],
    },
  };

  it('returns the exams of a module in the order listed', () => {
    expect(examsFor('205', schedule)).toEqual([{ date: '2026-11-16', label: 'End of Module 205' }]);
  });

  it('drops null, malformed and impossible dates instead of showing a wrong countdown', () => {
    expect(examsFor('206', schedule)).toEqual([]);
    expect(examsFor('207', schedule)).toEqual([]);
  });

  it('returns nothing for a module with no entry', () => {
    expect(examsFor('999', schedule)).toEqual([]);
  });
});

describe('hasExamDates', () => {
  it('is true for the shipped schedule', () => {
    expect(hasExamDates()).toBe(true);
  });

  it('is false for an empty schedule or one with only invalid dates', () => {
    expect(hasExamDates({ byModule: {} })).toBe(false);
    expect(
      hasExamDates({
        byModule: {
          '205': [
            { date: 'soon', label: 'x' },
            { date: null, label: 'y' },
          ],
        },
      })
    ).toBe(false);
  });
});

describe('daysUntil', () => {
  it('counts whole days, 0 on the day and negative afterwards', () => {
    expect(daysUntil('2026-11-27', '2026-11-10')).toBe(17);
    expect(daysUntil('2026-11-27', '2026-11-27')).toBe(0);
    expect(daysUntil('2026-11-27', '2026-11-28')).toBe(-1);
  });

  it('counts across a month and a year boundary', () => {
    expect(daysUntil('2026-12-02', '2026-11-30')).toBe(2);
    expect(daysUntil('2027-01-02', '2026-12-30')).toBe(3);
  });
});

describe('cairoToday', () => {
  it('is the Cairo calendar date, not the UTC one', () => {
    // 22:30 UTC on the 10th is already 00:30 on the 11th in Cairo (UTC+2).
    expect(cairoToday(new Date('2026-11-10T22:30:00Z'))).toBe('2026-11-11');
    expect(cairoToday(new Date('2026-11-10T12:00:00Z'))).toBe('2026-11-10');
  });
});
