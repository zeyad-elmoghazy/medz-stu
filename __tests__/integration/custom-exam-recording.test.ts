// jest.mock() must be written before the imports it affects — see
// require-admin.test.ts for the same note (ts-jest doesn't hoist).
jest.mock('@/lib/supabase-server', () => {
  const actual = jest.requireActual('@/lib/supabase-server');
  return {
    ...actual,
    createRouteHandlerClient: jest.fn(),
  };
});

import { NextRequest } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createRouteHandlerClient } from '@/lib/supabase-server';
import { POST as createPost } from '@/app/api/student/custom-exam/route';
import { PUT as progressPut } from '@/app/api/student/custom-exam/[examId]/progress/route';
import { POST as submitPost } from '@/app/api/student/custom-exam/[examId]/submit/route';
import { GET as statsGet } from '@/app/api/student/stats/route';
import { GET as chaptersBySubjectGet } from '@/app/api/student/catalogue/chapters-by-subject/route';
import {
  deriveChapterMistakes,
  deriveFocusAreas,
  fetchChapterQuizAttempts,
} from '@/lib/server/chapter-mistakes';
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

type RouteClient = Awaited<ReturnType<typeof createRouteHandlerClient>>;
function actAs(client: SupabaseClient) {
  mockCreateRouteHandlerClient.mockResolvedValue(client as unknown as RouteClient);
}

function req(method: string, url: string, body?: unknown): NextRequest {
  return new NextRequest(`http://localhost${url}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/**
 * "Recorded just like the chapter quiz": after a custom exam (finished
 * or not) the Progress page numbers, Focus Areas, the mistakes pool and
 * the catalogue's per-chapter "Practice mistakes" must all reflect it,
 * with every answer credited to the question's OWN chapter. Real
 * database, same pattern as student-stats-chapter-context.test.ts.
 */
describeIfSupabase('custom exam — recording', () => {
  const admin = getServiceRoleClient();
  let student: TestUser;
  let client: SupabaseClient;

  const subjectIds: string[] = [];
  const moduleCodes: string[] = [];
  let moduleCode: string;
  let moduleName: string;
  let subjA: { id: string; slug: string; name: string };
  let subjB: { id: string; slug: string; name: string };
  let chA: string;
  let chB: string;
  const qids: Record<string, number[]> = {};

  async function makeSubject(label: string) {
    const slug = uniqueSlug(label);
    const name = `Subject ${label}`;
    const { data, error } = await admin.from('subjects').insert({ slug, name }).select('id').single();
    if (error || !data) throw new Error(`subject fixture failed: ${error?.message}`);
    subjectIds.push((data as { id: string }).id);
    return { id: (data as { id: string }).id, slug, name };
  }

  async function makeChapter(subject: { id: string; slug: string }, name: string, n: number) {
    const { data: ch, error } = await admin
      .from('chapters')
      .insert({ module_code: moduleCode, subject_id: subject.id, slug: uniqueSlug(name), name })
      .select('id')
      .single();
    if (error || !ch) throw new Error(`chapter fixture failed: ${error?.message}`);
    const chapterId = (ch as { id: string }).id;
    const rows = Array.from({ length: n }, (_, i) => ({
      chapter_id: chapterId,
      subject_id: subject.slug,
      subject_bundle_id: Math.floor(Math.random() * 1e9),
      question: `${name} question ${i + 1}`,
      choices: [
        { id: 'a', text: 'Correct' },
        { id: 'b', text: 'Wrong' },
      ],
      correct_answer: 'a',
      topic: `${name} topic ${i + 1}`,
      status: 'published',
    }));
    const { data: qs, error: qErr } = await admin.from('questions').insert(rows).select('id');
    if (qErr || !qs) throw new Error(`questions fixture failed: ${qErr?.message}`);
    qids[chapterId] = (qs as { id: number }[]).map((q) => q.id);
    return chapterId;
  }

  beforeAll(async () => {
    student = await createTestUser(admin, 'student');
    client = await signInTestUser(student.email, student.password);

    subjA = await makeSubject('A');
    subjB = await makeSubject('B');
    moduleCode = uniqueSlug('module');
    moduleName = 'Recording Module';
    const { error } = await admin
      .from('modules')
      .insert({ code: moduleCode, subject_id: subjA.slug, name: moduleName });
    if (error) throw new Error(`module fixture failed: ${error.message}`);
    moduleCodes.push(moduleCode);
    await admin.from('module_subjects').insert([
      { module_code: moduleCode, subject_id: subjA.id },
      { module_code: moduleCode, subject_id: subjB.id },
    ]);
    chA = await makeChapter(subjA, 'Chapter A', 6);
    chB = await makeChapter(subjB, 'Chapter B', 6);
  });

  afterAll(async () => {
    const all = Object.values(qids).flat();
    await admin.from('quiz_sessions').delete().eq('student_id', student.id);
    await admin.from('custom_exam_progress').delete().eq('student_id', student.id);
    if (all.length) await admin.from('questions').delete().in('id', all);
    await admin.from('chapters').delete().in('module_code', moduleCodes);
    await admin.from('module_subjects').delete().in('module_code', moduleCodes);
    await admin.from('modules').delete().in('code', moduleCodes);
    await admin.from('subjects').delete().in('id', subjectIds);
    await deleteTestUser(admin, student.id);
  });

  afterEach(async () => {
    await admin.from('quiz_sessions').delete().eq('student_id', student.id);
    await admin.from('custom_exam_progress').delete().eq('student_id', student.id);
    // student_subject_stats refreshes on INSERT only, never on DELETE, so
    // after the deletes above it still holds the last test's totals (and
    // would inflate the next test's "before" snapshot). Production never
    // deletes sessions; tests do. Inserting then deleting a zero-question
    // session forces a refresh to the true, empty state.
    await admin.from('quiz_sessions').insert({
      student_id: student.id,
      subject_id: 'zz-reset',
      answers: {},
      score: 0,
      total_questions: 0,
      accuracy: 0,
    });
    await admin.from('quiz_sessions').delete().eq('student_id', student.id);
  });

  async function startExam(chapterIds: string[], count: number) {
    actAs(client);
    const res = await createPost(
      req('POST', '/api/student/custom-exam', { moduleCode, chapterIds, count })
    );
    const { examId } = await res.json();
    const { data } = await admin.from('custom_exam_progress').select('question_ids').eq('id', examId).single();
    return { examId: examId as string, ids: (data as { question_ids: number[] }).question_ids };
  }

  async function save(examId: string, answers: Record<string, string>, index: number) {
    actAs(client);
    return progressPut(req('PUT', `/api/student/custom-exam/${examId}/progress`, { answers, currentQuestionIndex: index }), {
      params: Promise.resolve({ examId }),
    });
  }

  async function submit(examId: string, answers?: Record<string, string>) {
    actAs(client);
    return submitPost(req('POST', `/api/student/custom-exam/${examId}/submit`, answers ? { answers } : {}), {
      params: Promise.resolve({ examId }),
    });
  }

  async function stats(): Promise<StudentStats> {
    actAs(client);
    const res = await statsGet();
    expect(res.status).toBe(200);
    return res.json();
  }

  /** Answer every drawn question: chapter A's wrong ('b'), chapter B's right ('a'). */
  function wrongInAcorrectInB(ids: number[]): Record<string, string> {
    const out: Record<string, string> = {};
    for (const id of ids) out[String(id)] = qids[chA].includes(id) ? 'b' : 'a';
    return out;
  }

  // ------------------------------------------------- mistakes / focus areas
  describe('answer history (Focus Areas + mistakes)', () => {
    test('a finished exam’s answers are credited to each question’s OWN chapter', async () => {
      const { examId, ids } = await startExam([chA, chB], 12);
      await submit(examId, wrongInAcorrectInB(ids));

      const attempts = await fetchChapterQuizAttempts(admin, student.id);
      expect(attempts).toHaveLength(12);
      expect(attempts.filter((a) => a.chapterId === chA)).toHaveLength(6);
      expect(attempts.filter((a) => a.chapterId === chB)).toHaveLength(6);
      expect(attempts.filter((a) => a.chapterId === chA).every((a) => a.chosen !== a.correctAnswer)).toBe(true);
      expect(attempts.filter((a) => a.chapterId === chB).every((a) => a.chosen === a.correctAnswer)).toBe(true);

      const mistakes = deriveChapterMistakes(attempts);
      expect(mistakes).toHaveLength(1);
      expect(mistakes[0].chapterId).toBe(chA);
      expect([...mistakes[0].questionIds].sort((x, y) => x - y)).toEqual([...qids[chA]].sort((x, y) => x - y));

      const focus = deriveFocusAreas(attempts);
      expect(focus[0]).toMatchObject({ chapterId: chA, accuracy: 0, attempted: 6 });
    });

    test('an unfinished exam’s answers count too (like an unfinished chapter)', async () => {
      const { examId, ids } = await startExam([chA, chB], 12);
      const some = Object.fromEntries(ids.slice(0, 4).map((id) => [String(id), 'b']));
      await save(examId, some, 3);
      const attempts = await fetchChapterQuizAttempts(admin, student.id);
      expect(attempts).toHaveLength(4);
      expect(attempts.every((a) => a.chosen === 'b')).toBe(true);
    });

    test('scoping to chapterIds returns only those chapters’ exam answers', async () => {
      const { examId, ids } = await startExam([chA, chB], 12);
      await submit(examId, wrongInAcorrectInB(ids));
      const onlyB = await fetchChapterQuizAttempts(admin, student.id, { chapterIds: [chB] });
      expect(onlyB).toHaveLength(6);
      expect(onlyB.every((a) => a.chapterId === chB)).toBe(true);
    });

    test('a later correct answer clears a mistake made in an exam (latest attempt wins)', async () => {
      const { examId, ids } = await startExam([chA], 6);
      await submit(examId, Object.fromEntries(ids.map((id) => [String(id), 'b'])));
      let attempts = await fetchChapterQuizAttempts(admin, student.id);
      expect(deriveChapterMistakes(attempts)[0].questionIds).toHaveLength(6);

      // Same questions answered correctly in a later chapter-quiz session.
      await admin.from('quiz_sessions').insert({
        student_id: student.id,
        subject_id: subjA.slug,
        chapter_id: chA,
        answers: Object.fromEntries(qids[chA].map((id) => [String(id), 'a'])),
        score: 6,
        total_questions: 6,
        accuracy: 100,
        completed_at: new Date(Date.now() + 60_000).toISOString(),
      });
      attempts = await fetchChapterQuizAttempts(admin, student.id);
      expect(deriveChapterMistakes(attempts)).toEqual([]);
    });

    test('the catalogue’s per-chapter Practice mistakes includes exam mistakes', async () => {
      const { examId, ids } = await startExam([chA, chB], 12);
      await submit(examId, wrongInAcorrectInB(ids));
      actAs(client);
      const res = await chaptersBySubjectGet(
        req('GET', `/api/student/catalogue/chapters-by-subject?moduleCode=${moduleCode}&subjectSlug=${subjA.slug}`)
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      const chapter = body.chapters.find((c: { id: string }) => c.id === chA);
      expect([...chapter.mistakeQuestionIds].sort((x: number, y: number) => x - y)).toEqual(
        [...qids[chA]].sort((x, y) => x - y)
      );
      expect(chapter.attempted).toBe(true);
    });
  });

  // ------------------------------------------------------------ Progress page
  describe('GET /api/student/stats', () => {
    test('a finished exam shows in Recent Challenges as ONE "Custom Exam" entry', async () => {
      const { examId, ids } = await startExam([chA, chB], 12);
      await submit(examId, wrongInAcorrectInB(ids)); // 6 / 12
      const s = await stats();

      const entry = s.recentChallenges[0];
      expect(s.recentChallenges.filter((c) => c.kind === 'custom_exam')).toHaveLength(1);
      expect(entry).toMatchObject({
        kind: 'custom_exam',
        subjectName: 'Custom Exam',
        chapterId: null,
        moduleCode,
        moduleName,
        chapterCount: 2,
        score: 6,
        total: 12,
        accuracy: 50,
      });
      expect(entry.inProgress).toBeFalsy();
    });

    test('exam answers count in the overall totals but not in any per-subject card', async () => {
      const before = await stats();
      const { examId, ids } = await startExam([chA, chB], 12);
      await submit(examId, wrongInAcorrectInB(ids));
      const after = await stats();

      expect(after.totalQuestionsAnswered - before.totalQuestionsAnswered).toBe(12);
      expect(after.totalCorrectAnswers - before.totalCorrectAnswers).toBe(6);
      // Per-subject cards are unchanged by the exam.
      expect(after.subjects.map((x) => [x.id, x.questionsAnswered])).toEqual(
        before.subjects.map((x) => [x.id, x.questionsAnswered])
      );
      expect(after.subjects.every((x) => x.id !== 'custom-exam')).toBe(true);
    });

    test('Focus Areas and mistakes name the real chapter, subject and module', async () => {
      const { examId, ids } = await startExam([chA, chB], 12);
      await submit(examId, wrongInAcorrectInB(ids));
      const s = await stats();

      const focus = s.focusAreas.find((f) => f.chapterId === chA);
      expect(focus).toMatchObject({
        chapterName: 'Chapter A',
        subjectName: subjA.name,
        moduleCode,
        moduleName,
        accuracy: 0,
        attempted: 6,
      });
      const mistake = s.mistakes.find((m) => m.chapterId === chA);
      expect(mistake).toMatchObject({ chapterName: 'Chapter A', subjectName: subjA.name, moduleCode });
      expect(mistake!.questionIds).toHaveLength(6);
      expect(s.mistakes.find((m) => m.chapterId === chB)).toBeUndefined();
    });

    test('an unfinished exam counts toward totals and is flagged in-progress', async () => {
      const before = await stats();
      const { examId, ids } = await startExam([chA, chB], 12);
      // 3 answered: 2 right, 1 wrong.
      await save(examId, { [String(ids[0])]: 'a', [String(ids[1])]: 'a', [String(ids[2])]: 'b' }, 2);
      const s = await stats();

      expect(s.totalQuestionsAnswered - before.totalQuestionsAnswered).toBe(3);
      expect(s.totalCorrectAnswers - before.totalCorrectAnswers).toBe(2);
      const entry = s.recentChallenges.find((c) => c.kind === 'custom_exam');
      expect(entry).toMatchObject({
        inProgress: true,
        score: 2,
        total: 3,
        questionTotal: 12,
        moduleCode,
        chapterCount: 2,
      });
    });

    test('finishing replaces the in-progress entry (nothing counted twice)', async () => {
      const before = await stats();
      const { examId, ids } = await startExam([chA, chB], 12);
      await save(examId, { [String(ids[0])]: 'a' }, 1);
      await submit(examId, wrongInAcorrectInB(ids));
      const s = await stats();

      const exams = s.recentChallenges.filter((c) => c.kind === 'custom_exam');
      expect(exams).toHaveLength(1);
      expect(exams[0].inProgress).toBeFalsy();
      expect(s.totalQuestionsAnswered - before.totalQuestionsAnswered).toBe(12);
    });

    test('the accuracy trend includes the exam', async () => {
      const { examId, ids } = await startExam([chA, chB], 12);
      await submit(examId, wrongInAcorrectInB(ids));
      const s = await stats();
      expect(s.progressHistory.at(-1)?.accuracy).toBe(50);
    });
  });
});
