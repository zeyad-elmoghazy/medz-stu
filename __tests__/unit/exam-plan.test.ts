import { chooseDailyTarget, planExam, type ExamGroup } from '@/lib/student/exam-plan';
import { buildExamGroups } from '@/lib/student/exam-plan-load';

const today = '2026-11-10';
const group = (date: string, remainingQuestions: number, label = 'Year 2 exams'): ExamGroup => ({
  date,
  label,
  remainingQuestions,
});

describe('planExam (the spec for what the countdown shows)', () => {
  it('shows nothing when no exam has a date', () => {
    expect(planExam(today, [])).toBeNull();
  });

  it('shows nothing once every exam is behind us', () => {
    expect(planExam(today, [group('2026-11-09', 100)])).toBeNull();
  });

  it('plans an upcoming exam', () => {
    expect(planExam(today, [group('2026-11-27', 170)])).toEqual({
      examDate: '2026-11-27',
      label: 'Year 2 exams',
      daysLeft: 17,
      remaining: 170,
      perDay: 10,
      status: 'upcoming',
    });
  });

  it('rounds the daily target up so the work really fits', () => {
    expect(planExam(today, [group('2026-11-12', 5)])?.perDay).toBe(3);
  });

  it('is "today" on the exam day, with nothing left to plan', () => {
    expect(planExam(today, [group(today, 50)])).toMatchObject({
      status: 'today',
      daysLeft: 0,
      perDay: 0,
    });
  });

  it('is "done" when nothing is left', () => {
    expect(planExam(today, [group('2026-11-27', 0)])).toMatchObject({
      status: 'done',
      remaining: 0,
      perDay: 0,
    });
  });

  it('plans the nearest exam that has not passed', () => {
    const plan = planExam(today, [
      group('2026-12-19', 900, 'Year 3 exams'),
      group('2026-11-09', 10, 'Gone'),
      group('2026-11-27', 170, 'Year 2 exams'),
    ]);
    expect(plan?.label).toBe('Year 2 exams');
  });

  it('never reports negative work', () => {
    expect(planExam(today, [group('2026-11-27', -5)])).toMatchObject({ remaining: 0, status: 'done' });
  });
});

describe('buildExamGroups (what is left per exam day)', () => {
  const modules = [
    { code: '201', name: 'Cardiovascular' },
    { code: '205', name: 'Central Nervous System' },
  ];
  const chapters = [
    { id: 'a', module_code: '201', published_count: 40 },
    { id: 'b', module_code: '201', published_count: 30 },
    { id: 'c', module_code: '205', published_count: 50 },
  ];
  const none = new Set<string>();
  const noAnswers = new Map<string, number>();

  it('returns nothing while no dates are set (the placeholders)', () => {
    const empty = { byYear: { 2: null }, byModule: {} };
    expect(buildExamGroups(2, modules, chapters, none, noAnswers, empty)).toEqual([]);
  });

  it('groups modules that share the year date and sums what is left', () => {
    const schedule = { byYear: { 2: '2026-11-27' }, byModule: {} };
    expect(buildExamGroups(2, modules, chapters, none, noAnswers, schedule)).toEqual([
      { date: '2026-11-27', label: 'Year 2 exams', remainingQuestions: 120 },
    ]);
  });

  it('counts finished chapters as covered and credits saved answers on unfinished ones', () => {
    const schedule = { byYear: { 2: '2026-11-27' }, byModule: {} };
    const groups = buildExamGroups(
      2,
      modules,
      chapters,
      new Set(['a']), // 40 done
      new Map([['c', 20]]), // 20 of 50 answered
      schedule
    );
    expect(groups[0].remainingQuestions).toBe(30 + 30);
  });

  it('splits a module with its own date into its own group, named after the module', () => {
    const schedule = { byYear: { 2: '2026-11-27' }, byModule: { '205': '2026-12-02' } };
    const groups = buildExamGroups(2, modules, chapters, none, noAnswers, schedule);
    expect(groups).toEqual(
      expect.arrayContaining([
        { date: '2026-11-27', label: 'Year 2 exams', remainingQuestions: 70 },
        { date: '2026-12-02', label: 'Central Nervous System exam', remainingQuestions: 50 },
      ])
    );
  });

  it('never goes negative when more answers are saved than the chapter has questions', () => {
    const schedule = { byYear: { 2: '2026-11-27' }, byModule: {} };
    const groups = buildExamGroups(2, modules, chapters, none, new Map([['a', 999]]), schedule);
    expect(groups[0].remainingQuestions).toBe(30 + 50);
  });
});

describe('chooseDailyTarget', () => {
  it('spreads the work evenly, rounding up', () => {
    expect(chooseDailyTarget(170, 17)).toBe(10);
    expect(chooseDailyTarget(171, 17)).toBe(11);
  });

  it('asks for everything at once on the last study day', () => {
    expect(chooseDailyTarget(40, 1)).toBe(40);
  });

  it('does not divide by zero', () => {
    expect(chooseDailyTarget(40, 0)).toBe(40);
  });
});
