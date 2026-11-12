import { chooseDailyTarget, planExam, type ExamGroup } from '@/lib/student/exam-plan';
import { buildExamGroups } from '@/lib/student/exam-plan-load';
import { EXAM_SCHEDULE } from '@/lib/exam-schedule';

const today = '2026-11-10';
const group = (
  date: string,
  remainingQuestions: number,
  label = 'End of Module 205',
  publishedQuestions = Math.max(remainingQuestions, 1)
): ExamGroup => ({ date, label, remainingQuestions, publishedQuestions });

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
      label: 'End of Module 205',
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

  it('is "done" when the module has questions and none are left', () => {
    expect(planExam(today, [group('2026-11-27', 0, 'End of Module 205', 300)])).toMatchObject({
      status: 'done',
      remaining: 0,
      perDay: 0,
    });
  });

  it('is "empty", not "done", when the module has no published questions yet', () => {
    expect(planExam(today, [group('2026-12-30', 0, 'End of Module 206', 0)])).toMatchObject({
      status: 'empty',
      remaining: 0,
      perDay: 0,
      daysLeft: 50,
    });
  });

  it('still says "today" on the exam day of an empty module', () => {
    expect(planExam(today, [group(today, 0, 'End of Module 206', 0)])?.status).toBe('today');
  });

  it('plans the nearest exam that has not passed', () => {
    const plan = planExam(today, [
      group('2026-12-19', 900, 'End of Module PAT 310'),
      group('2026-11-09', 10, 'Gone'),
      group('2026-11-27', 170, 'End of Module 205'),
    ]);
    expect(plan?.label).toBe('End of Module 205');
  });

  it('never reports negative work', () => {
    expect(planExam(today, [group('2026-11-27', -5)])).toMatchObject({ remaining: 0, status: 'done' });
  });
});

describe('buildExamGroups (what is left per exam)', () => {
  const none = new Set<string>();
  const noAnswers = new Map<string, number>();
  const schedule = {
    byModule: {
      '201': [
        { date: '2026-11-20', label: 'End of Module 201' },
        { date: '2026-12-10', label: 'Final 201' },
      ],
      '205': [{ date: '2026-11-20', label: 'End of Module 205' }],
    },
  };
  const modules = [
    { code: '201', name: 'Cardiovascular' },
    { code: '205', name: 'Central Nervous System' },
    { code: '299', name: 'No exams' },
  ];
  const chapters = [
    { id: 'a', module_code: '201', published_count: 40 },
    { id: 'b', module_code: '201', published_count: 30 },
    { id: 'c', module_code: '205', published_count: 50 },
  ];
  const byLabel = (groups: ExamGroup[], label: string) => groups.find((g) => g.label.includes(label));

  it('returns nothing for a module with no exams in the schedule', () => {
    expect(buildExamGroups([modules[2]], chapters, none, noAnswers, schedule)).toEqual([]);
  });

  it('makes one group per exam, End of Module and Final counting the whole module', () => {
    const groups = buildExamGroups([modules[0]], chapters, none, noAnswers, schedule);
    expect(groups).toEqual([
      { date: '2026-11-20', label: 'End of Module 201', remainingQuestions: 70, publishedQuestions: 70 },
      { date: '2026-12-10', label: 'Final 201', remainingQuestions: 70, publishedQuestions: 70 },
    ]);
  });

  it('merges exams that fall on the same day and sums what is left', () => {
    const groups = buildExamGroups(modules.slice(0, 2), chapters, none, noAnswers, schedule);
    expect(groups).toHaveLength(2);
    expect(byLabel(groups, 'End of Module 201')).toEqual({
      date: '2026-11-20',
      label: 'End of Module 201 + End of Module 205',
      remainingQuestions: 120,
      publishedQuestions: 120,
    });
  });

  it('counts finished chapters as covered and credits saved answers on unfinished ones', () => {
    const groups = buildExamGroups(
      modules.slice(0, 2),
      chapters,
      new Set(['a']), // 40 done
      new Map([['c', 20]]), // 20 of 50 answered
      schedule
    );
    expect(groups[0].remainingQuestions).toBe(30 + 30);
    expect(groups[0].publishedQuestions).toBe(120); // published does not shrink as they study
  });

  it('never goes negative when more answers are saved than the chapter has questions', () => {
    const groups = buildExamGroups(modules.slice(0, 2), chapters, none, new Map([['a', 999]]), schedule);
    expect(groups[0].remainingQuestions).toBe(30 + 50);
  });

  it('gives a module with exams but no published chapters publishedQuestions 0', () => {
    const groups = buildExamGroups([{ code: '206', name: 'GI' }], [], none, noAnswers, {
      byModule: { '206': [{ date: '2026-12-30', label: 'End of Module 206' }] },
    });
    expect(groups).toEqual([
      { date: '2026-12-30', label: 'End of Module 206', remainingQuestions: 0, publishedQuestions: 0 },
    ]);
  });
});

describe('the real schedule, student by student', () => {
  const none = new Set<string>();
  const noAnswers = new Map<string, number>();
  const mods = (...codes: string[]) => codes.map((code) => ({ code, name: code }));
  const ch = (module_code: string, published_count: number) => ({
    id: `${module_code}-1`,
    module_code,
    published_count,
  });
  const next = (day: string, modules: { code: string; name: string }[], chapters: ReturnType<typeof ch>[]) =>
    planExam(day, buildExamGroups(modules, chapters, none, noAnswers, EXAM_SCHEDULE));

  it('Year 1: End of Module ISK 101 first, then INT 102, then the two Finals', () => {
    const m = mods('101', '102');
    const c = [ch('101', 657), ch('102', 1265)];
    expect(next('2026-11-12', m, c)).toMatchObject({ label: 'End of Module ISK 101', daysLeft: 20 });
    expect(next('2026-12-03', m, c)).toMatchObject({ label: 'End of Module INT 102', daysLeft: 4 });
    expect(next('2026-12-08', m, c)).toMatchObject({ label: 'Final ISK 101', daysLeft: 4 });
    expect(next('2026-12-13', m, c)).toMatchObject({ label: 'Final INT 102', daysLeft: 8 });
    expect(next('2026-12-22', m, c)).toBeNull();
  });

  it('Year 2: 205 first; after it, 206 is "empty" while 206 has no published questions', () => {
    const m = mods('205', '206');
    const c = [ch('205', 1334)];
    expect(next('2026-11-12', m, c)).toMatchObject({ label: 'End of Module 205', daysLeft: 4, status: 'upcoming' });
    expect(next('2026-11-16', m, c)).toMatchObject({ label: 'End of Module 205', status: 'today' });
    expect(next('2026-11-17', m, c)).toMatchObject({ label: 'End of Module 206', daysLeft: 43, status: 'empty' });
  });

  it('Year 3: PAT 310 and INF 309 Finals, ending on 2 January 2027', () => {
    const m = mods('309', '310');
    const c = [ch('309', 2686), ch('310', 975)];
    expect(next('2026-12-10', m, c)).toMatchObject({ label: 'End of Module PAT 310', daysLeft: 9 });
    expect(next('2026-12-23', m, c)).toMatchObject({ label: 'End of Module INF 309', daysLeft: 7 });
    expect(next('2026-12-31', m, c)).toMatchObject({ label: 'Final INF 309', daysLeft: 2 });
    expect(next('2027-01-03', m, c)).toBeNull();
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
