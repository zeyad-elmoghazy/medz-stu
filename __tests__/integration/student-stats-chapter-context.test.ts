// jest.mock() must be written before the imports it affects — see
// require-admin.test.ts for the same note (ts-jest doesn't hoist).
jest.mock('@/lib/supabase-server', () => {
  const actual = jest.requireActual('@/lib/supabase-server');
  return {
    ...actual,
    createRouteHandlerClient: jest.fn(),
  };
});

import { createRouteHandlerClient } from '@/lib/supabase-server';
import { GET as statsGet } from '@/app/api/student/stats/route';
import type { StudentStats } from '@/lib/dashboard-data';
import {
  supabaseTestEnvAvailable,
  getServiceRoleClient,
  signInTestUser,
  createTestUser,
  deleteTestUser,
  uniqueSlug,
  type TestUser,
} from '../helpers/supabase-test-env';

const mockCreateRouteHandlerClient = createRouteHandlerClient as jest.MockedFunction<
  typeof createRouteHandlerClient
>;

const describeIfSupabase = supabaseTestEnvAvailable() ? describe : describe.skip;

/**
 * Progress page context: GET /api/student/stats must say, for every
 * Recent Challenge and every Focus Area, WHICH chapter in WHICH subject in
 * WHICH module it belongs to — read from the database, not from the
 * static SUBJECTS_CONFIG — and Focus Areas must actually populate for
 * realistic data (one unique topic per question). Real database, same
 * pattern as chapter-quiz-xp.test.ts; only the cookie-bound client
 * factory is mocked. Self-contained fixtures, cleaned up afterwards.
 */
describeIfSupabase('GET /api/student/stats — chapter/subject/module context', () => {
  const admin = getServiceRoleClient();
  let student: TestUser;

  // Two modules: one with a real name, one with the DB's placeholder style.
  const subjectIds: string[] = [];
  const moduleCodes: string[] = [];
  const chapterIds: string[] = [];
  let questionIds: number[] = [];

  type Fx = {
    subjectSlug: string;
    subjectName: string;
    moduleCode: string;
    moduleName: string;
    chapterId: string;
    chapterName: string;
    qids: number[];
  };
  let strong: Fx; // module with a real name, 100% answers
  let weak: Fx; // placeholder-named module, other subject, 1/4 right
  let tiny: Fx; // only 2 attempts — below the Focus Areas minimum

  async function makeFixture(label: string, subjectName: string, moduleName: string, chapterName: string): Promise<Fx> {
    const subjectSlug = uniqueSlug(`${label}-subject`);
    const { data: subject, error: sErr } = await admin
      .from('subjects')
      .insert({ slug: subjectSlug, name: subjectName })
      .select('id')
      .single();
    if (sErr || !subject) throw new Error(`subject fixture failed: ${sErr?.message}`);
    subjectIds.push((subject as { id: string }).id);

    const moduleCode = uniqueSlug(`${label}-module`);
    const { error: mErr } = await admin
      .from('modules')
      .insert({ code: moduleCode, subject_id: subjectSlug, name: moduleName });
    if (mErr) throw new Error(`module fixture failed: ${mErr.message}`);
    moduleCodes.push(moduleCode);

    const { data: chapter, error: cErr } = await admin
      .from('chapters')
      .insert({
        module_code: moduleCode,
        subject_id: (subject as { id: string }).id,
        slug: uniqueSlug(`${label}-chapter`),
        name: chapterName,
      })
      .select('id')
      .single();
    if (cErr || !chapter) throw new Error(`chapter fixture failed: ${cErr?.message}`);
    const chapterId = (chapter as { id: string }).id;
    chapterIds.push(chapterId);

    // 5 published questions, each with its OWN topic (prod-like).
    const rows = Array.from({ length: 5 }, (_, i) => ({
      chapter_id: chapterId,
      subject_id: subjectSlug,
      subject_bundle_id: i + 1,
      question: `${label} question ${i + 1}`,
      choices: [
        { id: 'a', text: 'Correct' },
        { id: 'b', text: 'Wrong' },
      ],
      correct_answer: 'a',
      topic: `${label} unique topic ${i + 1}`,
      status: 'published',
    }));
    const { data: qs, error: qErr } = await admin.from('questions').insert(rows).select('id');
    if (qErr || !qs) throw new Error(`questions fixture failed: ${qErr?.message}`);
    const qids = (qs as { id: number }[]).map((q) => q.id);
    questionIds = questionIds.concat(qids);

    return { subjectSlug, subjectName, moduleCode, moduleName, chapterId, chapterName, qids };
  }

  async function session(fx: Fx, correctOf: number, answered: number, completedAt: string) {
    const answers: Record<string, string> = {};
    fx.qids.slice(0, answered).forEach((id, i) => {
      answers[String(id)] = i < correctOf ? 'a' : 'b';
    });
    const { error } = await admin.from('quiz_sessions').insert({
      student_id: student.id,
      subject_id: fx.subjectSlug,
      chapter_id: fx.chapterId,
      answers,
      score: correctOf,
      total_questions: answered,
      accuracy: Number(((correctOf / answered) * 100).toFixed(2)),
      violations_count: 0,
      completed_at: completedAt,
    });
    if (error) throw new Error(`session fixture failed: ${error.message}`);
  }

  async function getStats(): Promise<StudentStats> {
    const client = await signInTestUser(student.email, student.password);
    mockCreateRouteHandlerClient.mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createRouteHandlerClient>>
    );
    const res = await statsGet();
    expect(res.status).toBe(200);
    return (await res.json()) as StudentStats;
  }

  beforeEach(async () => {
    student = await createTestUser(admin, 'student');
    strong = await makeFixture('strong', 'Microbiology & Immunology (test)', 'Nervous & Cardiovascular (test)', 'Cervical fascia (test)');
    weak = await makeFixture('weak', 'Parasitology (test)', 'Module 977', 'Nematoda (test)');
    tiny = await makeFixture('tiny', 'Histology (test)', 'Epithelial (test)', 'Tiny chapter (test)');
  });

  afterEach(async () => {
    await deleteTestUser(admin, student.id); // cascades profiles, quiz_sessions
    await admin.from('questions').delete().in('id', questionIds);
    await admin.from('chapters').delete().in('id', chapterIds);
    await admin.from('modules').delete().in('code', moduleCodes);
    await admin.from('subjects').delete().in('id', subjectIds);
    questionIds = [];
    chapterIds.length = 0;
    moduleCodes.length = 0;
    subjectIds.length = 0;
  });

  test('Recent Challenges carry chapter, DB subject name and module for each session', async () => {
    await session(weak, 1, 4, '2026-10-01T10:00:00.000Z');
    await session(strong, 3, 3, '2026-10-02T10:00:00.000Z');

    const stats = await getStats();
    // newest first
    expect(stats.recentChallenges.map((c) => c.chapterName)).toEqual([
      'Cervical fascia (test)',
      'Nematoda (test)',
    ]);

    const [first, second] = stats.recentChallenges;
    expect(first).toMatchObject({
      chapterId: strong.chapterId,
      chapterName: 'Cervical fascia (test)',
      moduleCode: strong.moduleCode,
      moduleName: 'Nervous & Cardiovascular (test)',
      // Not in SUBJECTS_CONFIG, so this can only come from subjects.name.
      subjectName: 'Microbiology & Immunology (test)',
      score: 3,
      total: 3,
    });
    expect(second).toMatchObject({
      chapterId: weak.chapterId,
      moduleCode: weak.moduleCode,
      moduleName: 'Module 977', // raw; the UI collapses placeholders via moduleLabel
      subjectName: 'Parasitology (test)',
    });
  });

  test('a legacy session without a chapter falls back to the configured subject name', async () => {
    const { error } = await admin.from('quiz_sessions').insert({
      student_id: student.id,
      subject_id: 'anatomy',
      chapter_id: null,
      answers: {},
      score: 2,
      total_questions: 3,
      accuracy: 66.67,
      violations_count: 0,
    });
    expect(error).toBeNull();

    const stats = await getStats();
    expect(stats.recentChallenges).toHaveLength(1);
    expect(stats.recentChallenges[0]).toMatchObject({
      subjectName: 'Anatomy',
      chapterId: null,
      chapterName: null,
      moduleCode: null,
      moduleName: null,
    });
  });

  test('Focus Areas populate from unique-topic questions, weakest chapter first, with full context', async () => {
    // strong: 3/3 right; weak: 1/4 right; tiny: 2 attempts only (below min of 3)
    await session(strong, 3, 3, '2026-10-01T10:00:00.000Z');
    await session(weak, 1, 4, '2026-10-02T10:00:00.000Z');
    await session(tiny, 0, 2, '2026-10-03T10:00:00.000Z');

    const stats = await getStats();
    expect(stats.focusAreas).toEqual([
      {
        chapterId: weak.chapterId,
        chapterName: 'Nematoda (test)',
        subjectName: 'Parasitology (test)',
        moduleCode: weak.moduleCode,
        moduleName: 'Module 977',
        accuracy: 25,
        attempted: 4,
      },
      {
        chapterId: strong.chapterId,
        chapterName: 'Cervical fascia (test)',
        subjectName: 'Microbiology & Immunology (test)',
        moduleCode: strong.moduleCode,
        moduleName: 'Nervous & Cardiovascular (test)',
        accuracy: 100,
        attempted: 3,
      },
    ]);
    // `tiny` (2 attempts) is excluded.
    expect(stats.focusAreas.map((f) => f.chapterId)).not.toContain(tiny.chapterId);
  });

  test('the practice-mistakes banner still reports the chapter and module code', async () => {
    await session(weak, 1, 4, '2026-10-01T10:00:00.000Z');

    const stats = await getStats();
    expect(stats.mistakes).toHaveLength(1);
    expect(stats.mistakes[0]).toMatchObject({
      chapterId: weak.chapterId,
      chapterName: 'Nematoda (test)',
      moduleCode: weak.moduleCode,
    });
    expect(stats.mistakes[0].questionIds).toHaveLength(3);
  });

  test('a student with no activity gets empty lists', async () => {
    const stats = await getStats();
    expect(stats.recentChallenges).toEqual([]);
    expect(stats.focusAreas).toEqual([]);
    expect(stats.mistakes).toEqual([]);
  });
});
