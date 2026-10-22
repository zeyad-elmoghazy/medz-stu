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
import { GET as catalogueGet } from '@/app/api/student/custom-exam/catalogue/route';
import { GET as activeGet, POST as createPost } from '@/app/api/student/custom-exam/route';
import {
  GET as examGet,
  DELETE as examDelete,
} from '@/app/api/student/custom-exam/[examId]/route';
import { PUT as progressPut } from '@/app/api/student/custom-exam/[examId]/progress/route';
import { POST as submitPost } from '@/app/api/student/custom-exam/[examId]/submit/route';
import {
  supabaseTestEnvAvailable,
  getServiceRoleClient,
  getAnonClient,
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
 * The Custom Exam API against a real database (same pattern as
 * chapter-quiz-xp.test.ts): only the cookie-bound client factory is
 * mocked. Self-contained fixtures — one module with two subjects and
 * four chapters of different sizes, plus an unrelated module — cleaned
 * up afterwards.
 */
describeIfSupabase('custom exam API', () => {
  const admin = getServiceRoleClient();
  let student: TestUser;
  let other: TestUser;
  let client: SupabaseClient;
  let otherClient: SupabaseClient;

  const subjectIds: string[] = [];
  const moduleCodes: string[] = [];
  let moduleCode: string;
  let otherModuleCode: string;
  let subjA: string; // subject ids
  let subjB: string;
  let chA1: string; // 5 published + 1 draft
  let chA2: string; // 3 published
  let chB1: string; // 4 published
  let chEmpty: string; // 0 published
  let chOther: string; // in the OTHER module, 2 published
  const qids: Record<string, number[]> = {}; // PUBLISHED ids per chapter
  const allQuestionIds: number[] = []; // everything inserted, drafts too — for cleanup

  async function makeChapter(
    module: string,
    subjectId: string,
    subjectSlug: string,
    name: string,
    published: number,
    draft = 0
  ): Promise<string> {
    const { data: ch, error } = await admin
      .from('chapters')
      .insert({ module_code: module, subject_id: subjectId, slug: uniqueSlug(name), name })
      .select('id')
      .single();
    if (error || !ch) throw new Error(`chapter fixture failed: ${error?.message}`);
    const chapterId = (ch as { id: string }).id;
    const rows = Array.from({ length: published + draft }, (_, i) => ({
      chapter_id: chapterId,
      subject_id: subjectSlug,
      subject_bundle_id: Math.floor(Math.random() * 1e9),
      question: `${name} question ${i + 1}`,
      choices: [
        { id: 'a', text: 'Correct' },
        { id: 'b', text: 'Wrong' },
      ],
      correct_answer: 'a',
      topic: `${name} topic ${i + 1}`,
      status: i < published ? 'published' : 'draft',
    }));
    if (rows.length > 0) {
      const { data: qs, error: qErr } = await admin.from('questions').insert(rows).select('id, status');
      if (qErr || !qs) throw new Error(`questions fixture failed: ${qErr?.message}`);
      allQuestionIds.push(...(qs as { id: number }[]).map((q) => q.id));
      qids[chapterId] = (qs as { id: number; status: string }[])
        .filter((q) => q.status === 'published')
        .map((q) => q.id);
    } else {
      qids[chapterId] = [];
    }
    return chapterId;
  }

  async function makeSubject(label: string): Promise<{ id: string; slug: string }> {
    const slug = uniqueSlug(label);
    const { data, error } = await admin
      .from('subjects')
      .insert({ slug, name: `Subject ${label}` })
      .select('id')
      .single();
    if (error || !data) throw new Error(`subject fixture failed: ${error?.message}`);
    subjectIds.push((data as { id: string }).id);
    return { id: (data as { id: string }).id, slug };
  }

  beforeAll(async () => {
    student = await createTestUser(admin, 'student');
    other = await createTestUser(admin, 'student');
    client = await signInTestUser(student.email, student.password);
    otherClient = await signInTestUser(other.email, other.password);

    const a = await makeSubject('A');
    const b = await makeSubject('B');
    subjA = a.id;
    subjB = b.id;

    moduleCode = uniqueSlug('module');
    otherModuleCode = uniqueSlug('module-other');
    for (const code of [moduleCode, otherModuleCode]) {
      const { error } = await admin
        .from('modules')
        .insert({ code, subject_id: a.slug, name: `Module ${code}` });
      if (error) throw new Error(`module fixture failed: ${error.message}`);
      moduleCodes.push(code);
    }
    await admin.from('module_subjects').insert([
      { module_code: moduleCode, subject_id: subjA },
      { module_code: moduleCode, subject_id: subjB },
      { module_code: otherModuleCode, subject_id: subjA },
    ]);

    chA1 = await makeChapter(moduleCode, subjA, a.slug, 'A1', 5, 1);
    chA2 = await makeChapter(moduleCode, subjA, a.slug, 'A2', 3);
    chB1 = await makeChapter(moduleCode, subjB, b.slug, 'B1', 4);
    chEmpty = await makeChapter(moduleCode, subjA, a.slug, 'Empty', 0);
    chOther = await makeChapter(otherModuleCode, subjA, a.slug, 'Other', 2);
  });

  afterAll(async () => {
    await admin.from('quiz_sessions').delete().in('student_id', [student.id, other.id]);
    await admin.from('custom_exam_progress').delete().in('student_id', [student.id, other.id]);
    if (allQuestionIds.length) await admin.from('questions').delete().in('id', allQuestionIds);
    await admin.from('chapters').delete().in('module_code', moduleCodes);
    await admin.from('module_subjects').delete().in('module_code', moduleCodes);
    await admin.from('modules').delete().in('code', moduleCodes);
    await admin.from('subjects').delete().in('id', subjectIds);
    await deleteTestUser(admin, student.id);
    await deleteTestUser(admin, other.id);
  });

  afterEach(async () => {
    await admin.from('custom_exam_progress').delete().in('student_id', [student.id, other.id]);
    await admin.from('quiz_sessions').delete().in('student_id', [student.id, other.id]);
  });

  async function createExam(chapterIds: string[], count: number, who: SupabaseClient = client) {
    actAs(who);
    return createPost(req('POST', '/api/student/custom-exam', { moduleCode, chapterIds, count }));
  }

  // ---------------------------------------------------------------- catalogue
  describe('GET catalogue', () => {
    test('lists the module’s subjects with chapters and PUBLISHED counts only', async () => {
      actAs(client);
      const res = await catalogueGet(
        req('GET', `/api/student/custom-exam/catalogue?module=${moduleCode}`)
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.moduleCode).toBe(moduleCode);
      expect(body.subjects).toHaveLength(2);
      const a = body.subjects.find((s: { id: string }) => s.id === subjA);
      const b = body.subjects.find((s: { id: string }) => s.id === subjB);
      expect(a.publishedCount).toBe(8); // A1 5 (draft excluded) + A2 3 + Empty 0
      expect(a.chapters.map((c: { id: string }) => c.id).sort()).toEqual(
        [chA1, chA2, chEmpty].sort()
      );
      expect(a.chapters.find((c: { id: string }) => c.id === chA1).publishedCount).toBe(5);
      expect(b.publishedCount).toBe(4);
    });

    test('unknown module is 404 and a missing param is 400', async () => {
      actAs(client);
      expect((await catalogueGet(req('GET', '/api/student/custom-exam/catalogue?module=nope-nope'))).status).toBe(404);
      expect((await catalogueGet(req('GET', '/api/student/custom-exam/catalogue'))).status).toBe(400);
    });

    test('requires a signed-in user', async () => {
      actAs(getAnonClient());
      expect((await catalogueGet(req('GET', `/api/student/custom-exam/catalogue?module=${moduleCode}`))).status).toBe(401);
    });
  });

  // ------------------------------------------------------------------- create
  describe('POST create', () => {
    test('rejects more questions than are available, and says how many are', async () => {
      const res = await createExam([chA1, chA2], 9); // 5 + 3 = 8 available
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.available).toBe(8);
      const { data } = await admin.from('custom_exam_progress').select('id').eq('student_id', student.id);
      expect(data).toHaveLength(0);
    });

    test('accepts exactly the maximum and draws every published question once', async () => {
      const res = await createExam([chA1, chA2], 8);
      expect(res.status).toBe(200);
      const { examId, total } = await res.json();
      expect(total).toBe(8);
      const { data } = await admin.from('custom_exam_progress').select('*').eq('id', examId).single();
      const row = data as { question_ids: number[]; chapter_ids: string[]; total_questions: number; module_code: string };
      expect([...row.question_ids].sort((x, y) => x - y)).toEqual(
        [...qids[chA1], ...qids[chA2]].sort((x, y) => x - y)
      );
      expect(row.total_questions).toBe(8);
      expect(row.module_code).toBe(moduleCode);
      expect([...row.chapter_ids].sort()).toEqual([chA1, chA2].sort());
    });

    test('the draw never includes draft questions or chapters that were not picked', async () => {
      for (let i = 0; i < 5; i++) {
        const res = await createExam([chA1], 3);
        const { examId } = await res.json();
        const { data } = await admin.from('custom_exam_progress').select('question_ids').eq('id', examId).single();
        for (const id of (data as { question_ids: number[] }).question_ids) {
          expect(qids[chA1]).toContain(id); // published A1 only
        }
      }
    });

    test('a draw across subjects can include both subjects', async () => {
      const res = await createExam([chA2, chB1], 7);
      expect(res.status).toBe(200);
      const { examId } = await res.json();
      const { data } = await admin.from('custom_exam_progress').select('question_ids').eq('id', examId).single();
      const ids = (data as { question_ids: number[] }).question_ids;
      expect(ids.some((i) => qids[chA2].includes(i))).toBe(true);
      expect(ids.some((i) => qids[chB1].includes(i))).toBe(true);
    });

    test('refuses chapters from another module, unknown chapters, and empty selections', async () => {
      expect((await createExam([chA1, chOther], 2)).status).toBe(400);
      expect((await createExam(['00000000-0000-4000-8000-000000000000'], 1)).status).toBe(400);
      actAs(client);
      const empty = await createPost(req('POST', '/api/student/custom-exam', { moduleCode, chapterIds: [], count: 1 }));
      expect(empty.status).toBe(400);
    });

    test('a chapter with no published questions cannot be examined', async () => {
      const res = await createExam([chEmpty], 1);
      expect(res.status).toBe(400);
      expect((await res.json()).available).toBe(0);
    });

    test('rejects count 0, negative, fractional and absurd values', async () => {
      for (const count of [0, -3, 2.5, 1e9]) {
        actAs(client);
        const res = await createPost(
          req('POST', '/api/student/custom-exam', { moduleCode, chapterIds: [chA1], count })
        );
        expect(res.status).toBe(400);
      }
    });

    test('starting a second exam replaces the first (one unfinished exam per student)', async () => {
      const first = await (await createExam([chA1], 2)).json();
      const second = await (await createExam([chA2], 2)).json();
      expect(second.examId).not.toBe(first.examId);
      const { data } = await admin.from('custom_exam_progress').select('id').eq('student_id', student.id);
      expect((data as { id: string }[]).map((r) => r.id)).toEqual([second.examId]);
    });

    test('requires a signed-in student', async () => {
      actAs(getAnonClient());
      const res = await createPost(
        req('POST', '/api/student/custom-exam', { moduleCode, chapterIds: [chA1], count: 1 })
      );
      expect(res.status).toBe(401);
    });

    test('the "re-sit" shape builds an exam from specific questions', async () => {
      actAs(client);
      const pick = [qids[chA1][0], qids[chB1][1]];
      const res = await createPost(
        req('POST', '/api/student/custom-exam', { moduleCode, questionIds: pick })
      );
      expect(res.status).toBe(200);
      const { examId, total } = await res.json();
      expect(total).toBe(2);
      const { data } = await admin.from('custom_exam_progress').select('question_ids, chapter_ids').eq('id', examId).single();
      const row = data as { question_ids: number[]; chapter_ids: string[] };
      expect([...row.question_ids].sort((x, y) => x - y)).toEqual([...pick].sort((x, y) => x - y));
      expect([...row.chapter_ids].sort()).toEqual([chA1, chB1].sort());
    });

    test('a re-sit with questions from another module is refused', async () => {
      actAs(client);
      const res = await createPost(
        req('POST', '/api/student/custom-exam', { moduleCode, questionIds: [qids[chA1][0], qids[chOther][0]] })
      );
      expect(res.status).toBe(400);
    });
  });

  // --------------------------------------------------------------- read / own
  describe('GET exam + active', () => {
    test('returns the drawn questions in stored order with their own chapter and subject', async () => {
      const { examId } = await (await createExam([chA2, chB1], 7)).json();
      const { data } = await admin.from('custom_exam_progress').select('question_ids').eq('id', examId).single();
      const stored = (data as { question_ids: number[] }).question_ids;

      actAs(client);
      const res = await examGet(req('GET', `/api/student/custom-exam/${examId}`), {
        params: Promise.resolve({ examId }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.questions.map((q: { id: number }) => q.id)).toEqual(stored);
      expect(body.questionTotal).toBe(7);
      expect(body.moduleCode).toBe(moduleCode);
      const q0 = body.questions[0];
      expect([chA2, chB1]).toContain(q0.chapterId);
      expect(q0.chapterName).toMatch(/^(A2|B1)$/);
      expect(q0.subjectName).toMatch(/^Subject (A|B)$/);
      expect(body.progress).toEqual({ answers: {}, currentQuestionIndex: 0 });
    });

    test('another student’s exam id is a 404, never a leak', async () => {
      const { examId } = await (await createExam([chA1], 2)).json();
      actAs(otherClient);
      const res = await examGet(req('GET', `/api/student/custom-exam/${examId}`), {
        params: Promise.resolve({ examId }),
      });
      expect(res.status).toBe(404);
    });

    test('a malformed id is a 400', async () => {
      actAs(client);
      const res = await examGet(req('GET', '/api/student/custom-exam/not-a-uuid'), {
        params: Promise.resolve({ examId: 'not-a-uuid' }),
      });
      expect(res.status).toBe(400);
    });

    test('active summary reflects answers so far and is null once discarded', async () => {
      actAs(client);
      expect(await (await activeGet(req('GET', '/api/student/custom-exam'))).json()).toEqual({ exam: null });

      const { examId } = await (await createExam([chA1, chA2], 6)).json();
      const { data } = await admin.from('custom_exam_progress').select('question_ids').eq('id', examId).single();
      const ids = (data as { question_ids: number[] }).question_ids;
      actAs(client);
      await progressPut(
        req('PUT', `/api/student/custom-exam/${examId}/progress`, {
          answers: { [String(ids[0])]: 'a', [String(ids[1])]: 'b' },
          currentQuestionIndex: 2,
        }),
        { params: Promise.resolve({ examId }) }
      );
      actAs(client);
      const active = await (await activeGet(req('GET', '/api/student/custom-exam'))).json();
      expect(active.exam).toMatchObject({ id: examId, moduleCode, answered: 2, total: 6, chapterCount: 2 });

      actAs(client);
      const del = await examDelete(req('DELETE', `/api/student/custom-exam/${examId}`), {
        params: Promise.resolve({ examId }),
      });
      expect(del.status).toBe(200);
      actAs(client);
      expect(await (await activeGet(req('GET', '/api/student/custom-exam'))).json()).toEqual({ exam: null });
    });

    test('another student cannot discard my exam', async () => {
      const { examId } = await (await createExam([chA1], 2)).json();
      actAs(otherClient);
      await examDelete(req('DELETE', `/api/student/custom-exam/${examId}`), {
        params: Promise.resolve({ examId }),
      });
      const { data } = await admin.from('custom_exam_progress').select('id').eq('id', examId);
      expect(data).toHaveLength(1);
    });
  });

  // ----------------------------------------------------------------- progress
  describe('PUT progress', () => {
    async function start(count = 6) {
      const { examId } = await (await createExam([chA1, chA2], count)).json();
      const { data } = await admin.from('custom_exam_progress').select('question_ids').eq('id', examId).single();
      return { examId, ids: (data as { question_ids: number[] }).question_ids };
    }
    function put(examId: string, body: unknown) {
      actAs(client);
      return progressPut(req('PUT', `/api/student/custom-exam/${examId}/progress`, body), {
        params: Promise.resolve({ examId }),
      });
    }
    async function stored(examId: string) {
      const { data } = await admin
        .from('custom_exam_progress')
        .select('answers, current_question_index')
        .eq('id', examId)
        .single();
      return data as { answers: Record<string, string>; current_question_index: number };
    }

    test('saves answers and position', async () => {
      const { examId, ids } = await start();
      const res = await put(examId, { answers: { [String(ids[0])]: 'a' }, currentQuestionIndex: 1 });
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ saved: true, answered: 1, total: 6 });
      expect(await stored(examId)).toEqual({ answers: { [String(ids[0])]: 'a' }, current_question_index: 1 });
    });

    test('a late save with fewer answers never erases newer ones', async () => {
      const { examId, ids } = await start();
      await put(examId, { answers: { [String(ids[0])]: 'a', [String(ids[1])]: 'b' }, currentQuestionIndex: 2 });
      await put(examId, { answers: { [String(ids[0])]: 'a' }, currentQuestionIndex: 1 });
      expect((await stored(examId)).answers).toEqual({ [String(ids[0])]: 'a', [String(ids[1])]: 'b' });
    });

    test('answers for questions outside this exam are dropped', async () => {
      const { examId, ids } = await start();
      await put(examId, {
        answers: { [String(ids[0])]: 'a', [String(qids[chB1][0])]: 'a', '999999999': 'a' },
        currentQuestionIndex: 0,
      });
      expect(Object.keys((await stored(examId)).answers)).toEqual([String(ids[0])]);
    });

    test('the position is clamped into the exam', async () => {
      const { examId, ids } = await start(6);
      await put(examId, { answers: { [String(ids[0])]: 'a' }, currentQuestionIndex: 99 });
      expect((await stored(examId)).current_question_index).toBe(5);
    });

    test('someone else’s or a submitted exam is a 404', async () => {
      const { examId, ids } = await start();
      actAs(otherClient);
      const res = await progressPut(
        req('PUT', `/api/student/custom-exam/${examId}/progress`, { answers: { [String(ids[0])]: 'a' }, currentQuestionIndex: 0 }),
        { params: Promise.resolve({ examId }) }
      );
      expect(res.status).toBe(404);
      expect((await stored(examId)).answers).toEqual({});
    });

    test('a malformed body is a 400', async () => {
      const { examId } = await start();
      expect((await put(examId, { answers: 'nope' })).status).toBe(400);
      expect((await put(examId, { answers: {}, currentQuestionIndex: -1 })).status).toBe(400);
    });
  });

  // ------------------------------------------------------------------- submit
  describe('POST submit', () => {
    async function startExam(chapterIds: string[], count: number) {
      const { examId } = await (await createExam(chapterIds, count)).json();
      const { data } = await admin.from('custom_exam_progress').select('question_ids').eq('id', examId).single();
      return { examId, ids: (data as { question_ids: number[] }).question_ids };
    }
    function submit(examId: string, answers?: Record<string, string>, who: SupabaseClient = client) {
      actAs(who);
      return submitPost(req('POST', `/api/student/custom-exam/${examId}/submit`, answers ? { answers } : {}), {
        params: Promise.resolve({ examId }),
      });
    }
    async function profile() {
      const { data } = await admin
        .from('profiles')
        .select('total_xp, total_correct_answers, total_questions_answered')
        .eq('id', student.id)
        .single();
      return data as { total_xp: number; total_correct_answers: number; total_questions_answered: number };
    }

    test('scores server-side, records ONE exam session, credits XP, clears the saved exam', async () => {
      const { examId, ids } = await startExam([chA1, chB1], 9);
      const before = await profile();
      // 6 right ("a"), 2 wrong ("b"), 1 skipped.
      const answers: Record<string, string> = {};
      ids.slice(0, 6).forEach((id) => (answers[String(id)] = 'a'));
      ids.slice(6, 8).forEach((id) => (answers[String(id)] = 'b'));
      const res = await submit(examId, answers);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toMatchObject({ score: 6, total: 9, accuracy: 66.67, xpEarned: 60 });
      expect(body.results).toHaveLength(9);
      expect(body.results.map((r: { questionId: number }) => r.questionId)).toEqual(ids);
      expect(body.results[8]).toMatchObject({ chosen: null, isCorrect: false });
      expect(body.questions).toHaveLength(9);
      expect(body.questions[0]).toHaveProperty('chapterName');

      const { data: sessions } = await admin.from('quiz_sessions').select('*').eq('student_id', student.id);
      expect(sessions).toHaveLength(1);
      expect(sessions![0]).toMatchObject({
        subject_id: 'custom-exam',
        chapter_id: null,
        exam_id: examId,
        exam_module_code: moduleCode,
        score: 6,
        total_questions: 9,
        violations_count: 0,
      });
      expect([...(sessions![0].exam_chapter_ids as string[])].sort()).toEqual([chA1, chB1].sort());
      expect(Object.keys(sessions![0].answers as object)).toHaveLength(8);

      const after = await profile();
      expect({
        total_xp: after.total_xp - before.total_xp,
        total_correct_answers: after.total_correct_answers - before.total_correct_answers,
        total_questions_answered: after.total_questions_answered - before.total_questions_answered,
      }).toEqual({ total_xp: 60, total_correct_answers: 6, total_questions_answered: 9 });
      const { data: left } = await admin.from('custom_exam_progress').select('id').eq('id', examId);
      expect(left).toHaveLength(0);
    });

    test('uses answers saved earlier via /progress when the body has none', async () => {
      const { examId, ids } = await startExam([chA1], 4);
      actAs(client);
      await progressPut(
        req('PUT', `/api/student/custom-exam/${examId}/progress`, {
          answers: Object.fromEntries(ids.map((id) => [String(id), 'a'])),
          currentQuestionIndex: 3,
        }),
        { params: Promise.resolve({ examId }) }
      );
      const res = await submit(examId);
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ score: 4, total: 4, accuracy: 100, xpEarned: 60 });
    });

    test('an exam with no answers at all is refused and stays resumable', async () => {
      const { examId } = await startExam([chA1], 3);
      expect((await submit(examId)).status).toBe(400);
      const { data } = await admin.from('custom_exam_progress').select('id').eq('id', examId);
      expect(data).toHaveLength(1);
      expect((await admin.from('quiz_sessions').select('id').eq('student_id', student.id)).data).toHaveLength(0);
    });

    test('submitting twice records and credits it only once', async () => {
      const { examId, ids } = await startExam([chA1], 4);
      const answers = Object.fromEntries(ids.map((id) => [String(id), 'a']));
      // The student is shared across tests, so measure the change.
      const before = (await profile()).total_xp;
      const first = await submit(examId, answers);
      const second = await submit(examId, answers);
      expect(first.status).toBe(200);
      expect(second.status).toBe(404);
      expect((await admin.from('quiz_sessions').select('id').eq('student_id', student.id)).data).toHaveLength(1);
      // 4 correct * 10 XP * 1.5 accuracy bonus = 60, once.
      expect((await profile()).total_xp - before).toBe(60);
    });

    test('two simultaneous submits credit XP exactly once', async () => {
      const { examId, ids } = await startExam([chA1, chA2], 8);
      const answers = Object.fromEntries(ids.map((id) => [String(id), 'a']));
      const before = (await profile()).total_xp;
      actAs(client);
      const [r1, r2] = await Promise.all([
        submitPost(req('POST', `/api/student/custom-exam/${examId}/submit`, { answers }), { params: Promise.resolve({ examId }) }),
        submitPost(req('POST', `/api/student/custom-exam/${examId}/submit`, { answers }), { params: Promise.resolve({ examId }) }),
      ]);
      const statuses = [r1.status, r2.status];
      // Exactly one wins; the loser is turned away (404 if the winner had
      // already cleaned up, 409 if it lost the unique-index race).
      expect(statuses.filter((s) => s === 200)).toHaveLength(1);
      expect(statuses.filter((s) => s === 404 || s === 409)).toHaveLength(1);
      expect((await admin.from('quiz_sessions').select('id').eq('student_id', student.id)).data).toHaveLength(1);
      // 8 correct -> 80 XP * 1.5 accuracy bonus = 120, credited once.
      expect((await profile()).total_xp - before).toBe(120);
    });

    test('the unique exam_id index itself rejects a duplicate session row', async () => {
      const { examId } = await startExam([chA1], 2);
      const row = { student_id: student.id, subject_id: 'custom-exam', answers: {}, exam_id: examId };
      expect((await admin.from('quiz_sessions').insert(row)).error).toBeNull();
      const dup = await admin.from('quiz_sessions').insert(row);
      expect(dup.error?.code).toBe('23505');
    });

    test('another student cannot submit my exam', async () => {
      const { examId, ids } = await startExam([chA1], 3);
      const res = await submit(examId, { [String(ids[0])]: 'a' }, otherClient);
      expect(res.status).toBe(404);
      expect((await admin.from('quiz_sessions').select('id').eq('student_id', other.id)).data).toHaveLength(0);
    });

    test('a forged correct answer or foreign question id changes nothing', async () => {
      const { examId, ids } = await startExam([chA1], 3);
      const res = await submit(examId, {
        [String(ids[0])]: 'b',
        [String(qids[chB1][0])]: 'a', // not part of this exam
      });
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ score: 0, total: 3 });
    });
  });

  // ------------------------------------------------- direct table access (RLS)
  describe('direct table access', () => {
    test('a student can read only their own unfinished exam', async () => {
      await createExam([chA1], 2);
      await createExam([chA2], 2, otherClient);
      const mine = await client.from('custom_exam_progress').select('student_id');
      expect((mine.data ?? []).map((r: { student_id: string }) => r.student_id)).toEqual([student.id]);
    });

    test('a student cannot write the table directly', async () => {
      const ins = await client.from('custom_exam_progress').insert({
        student_id: student.id,
        module_code: moduleCode,
        question_ids: [1],
        total_questions: 1,
      });
      expect(ins.error).not.toBeNull();

      const { examId } = await (await createExam([chA1], 2)).json();
      const upd = await client.from('custom_exam_progress').update({ answers: { '1': 'a' } }).eq('id', examId).select();
      expect(upd.data ?? []).toHaveLength(0);
      const del = await client.from('custom_exam_progress').delete().eq('id', examId).select();
      expect(del.data ?? []).toHaveLength(0);
      expect((await admin.from('custom_exam_progress').select('id').eq('id', examId)).data).toHaveLength(1);
    });
  });
});
