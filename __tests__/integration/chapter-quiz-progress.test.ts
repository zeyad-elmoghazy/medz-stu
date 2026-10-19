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
import { createRouteHandlerClient } from '@/lib/supabase-server';
import {
  GET as progressGet,
  PUT as progressPut,
  DELETE as progressDelete,
} from '@/app/api/student/chapters/[chapterId]/progress/route';
import { POST as chapterSubmitPost } from '@/app/api/student/chapters/[chapterId]/submit/route';
import { GET as chaptersBySubjectGet } from '@/app/api/student/catalogue/chapters-by-subject/route';
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
 * Unfinished chapter attempts (chapter_quiz_progress, migration 032):
 * the progress route (GET/PUT/DELETE), the submit route turning an
 * attempt into a completed one exactly once, the catalogue's
 * `inProgress` ("Continue"), and the Progress dashboard counting
 * answers from a chapter that isn't finished. Real database, same
 * pattern as chapter-quiz-xp.test.ts; only the cookie-bound client
 * factory is mocked. Self-contained fixtures, cleaned up afterwards.
 */
describeIfSupabase('chapter quiz progress (unfinished attempts)', () => {
  const admin = getServiceRoleClient();
  let student: TestUser;
  let other: TestUser;
  let subjectId: string;
  let subjectSlug: string;
  let moduleCode: string;
  let chapterId: string;
  let otherChapterId: string;
  let questionIds: number[] = []; // 10 questions in `chapterId`, correct answer 'a'
  let otherQuestionIds: number[] = []; // 2 questions in `otherChapterId`

  // `bundleBase` keeps subject_bundle_id unique per subject across the
  // fixture's chapters (questions are unique on (subject_id, bundle id)).
  async function makeChapter(
    name: string,
    count: number,
    bundleBase: number
  ): Promise<{ id: string; qids: number[] }> {
    const { data: chapter, error } = await admin
      .from('chapters')
      .insert({
        module_code: moduleCode,
        subject_id: subjectId,
        slug: uniqueSlug(name),
        name,
      })
      .select('id')
      .single();
    if (error || !chapter) throw new Error(`chapter fixture failed: ${error?.message}`);
    const id = (chapter as { id: string }).id;

    const rows = Array.from({ length: count }, (_, i) => ({
      chapter_id: id,
      subject_id: subjectSlug,
      subject_bundle_id: bundleBase + i + 1,
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
    return { id, qids: (qs as { id: number }[]).map((q) => q.id) };
  }

  beforeEach(async () => {
    student = await createTestUser(admin, 'student');
    other = await createTestUser(admin, 'student');

    subjectSlug = uniqueSlug('subject');
    const { data: subject, error: subjectErr } = await admin
      .from('subjects')
      .insert({ slug: subjectSlug, name: `Subject ${subjectSlug}` })
      .select('id')
      .single();
    if (subjectErr || !subject) throw new Error(`subject fixture failed: ${subjectErr?.message}`);
    subjectId = (subject as { id: string }).id;

    moduleCode = uniqueSlug('module');
    const { error: moduleErr } = await admin
      .from('modules')
      .insert({ code: moduleCode, subject_id: subjectSlug, name: `Module ${moduleCode}` });
    if (moduleErr) throw new Error(`module fixture failed: ${moduleErr.message}`);

    const main = await makeChapter('Main chapter', 10, 0);
    chapterId = main.id;
    questionIds = main.qids;
    const side = await makeChapter('Other chapter', 2, 100);
    otherChapterId = side.id;
    otherQuestionIds = side.qids;
  });

  afterEach(async () => {
    await admin.from('chapter_quiz_progress').delete().in('chapter_id', [chapterId, otherChapterId]);
    await admin.from('questions').delete().in('id', [...questionIds, ...otherQuestionIds]);
    await admin.from('chapters').delete().in('id', [chapterId, otherChapterId]);
    await admin.from('modules').delete().eq('code', moduleCode);
    await admin.from('subjects').delete().eq('id', subjectId);
    await deleteTestUser(admin, student.id); // cascades profiles, quiz_sessions, progress
    await deleteTestUser(admin, other.id);
  });

  async function actAs(user: TestUser) {
    const client = await signInTestUser(user.email, user.password);
    mockCreateRouteHandlerClient.mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createRouteHandlerClient>>
    );
    return client;
  }

  const params = (id: string) => ({ params: Promise.resolve({ chapterId: id }) });
  const url = (id: string) => `http://localhost/api/student/chapters/${id}/progress`;

  function put(id: string, body: unknown) {
    return progressPut(
      new NextRequest(url(id), {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
      params(id)
    );
  }
  const get = (id: string) => progressGet(new NextRequest(url(id)), params(id));
  const del = (id: string) =>
    progressDelete(new NextRequest(url(id), { method: 'DELETE' }), params(id));

  function answersFor(ids: number[], choice = 'a'): Record<string, string> {
    return Object.fromEntries(ids.map((id) => [String(id), choice]));
  }

  async function progressRow(studentId: string, id = chapterId) {
    const { data } = await admin
      .from('chapter_quiz_progress')
      .select('*')
      .eq('student_id', studentId)
      .eq('chapter_id', id)
      .maybeSingle();
    return data as {
      answers: Record<string, string>;
      question_ids: number[] | null;
      current_question_index: number;
      total_questions: number;
      subject_id: string;
    } | null;
  }

  async function getStats(): Promise<StudentStats> {
    const res = await statsGet();
    expect(res.status).toBe(200);
    return (await res.json()) as StudentStats;
  }

  test('GET returns null when nothing is saved', async () => {
    await actAs(student);
    const res = await get(chapterId);
    expect(res.status).toBe(200);
    expect((await res.json()).progress).toBeNull();
  });

  test('PUT saves the attempt and GET returns it', async () => {
    await actAs(student);
    const answers = answersFor(questionIds.slice(0, 3));
    const res = await put(chapterId, { answers, currentQuestionIndex: 2 });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ saved: true, answered: 3, total: 10 });

    const row = await progressRow(student.id);
    expect(row).toMatchObject({
      answers,
      question_ids: null,
      current_question_index: 2,
      total_questions: 10,
      subject_id: subjectSlug,
    });

    const body = await (await get(chapterId)).json();
    expect(body.progress).toMatchObject({
      answers,
      currentQuestionIndex: 2,
      questionIds: null,
      totalQuestions: 10,
    });
  });

  test('a later save with fewer answers never erases answers already stored', async () => {
    await actAs(student);
    await put(chapterId, { answers: answersFor(questionIds.slice(0, 4)), currentQuestionIndex: 3 });
    // A stale/retried request that only knows about the first answer.
    const res = await put(chapterId, {
      answers: answersFor(questionIds.slice(0, 1)),
      currentQuestionIndex: 0,
    });
    expect(res.status).toBe(200);
    expect((await progressRow(student.id))?.answers).toEqual(answersFor(questionIds.slice(0, 4)));
  });

  test('answers for other chapters and junk keys are dropped; a chapter with no questions is rejected', async () => {
    await actAs(student);
    const res = await put(chapterId, {
      answers: {
        ...answersFor(questionIds.slice(0, 2)),
        ...answersFor(otherQuestionIds), // belongs to another chapter
        notanumber: 'a',
      },
      currentQuestionIndex: 1,
    });
    expect(res.status).toBe(200);
    expect((await progressRow(student.id))?.answers).toEqual(answersFor(questionIds.slice(0, 2)));

    const missing = await put('00000000-0000-4000-8000-000000000000', {
      answers: { '1': 'a' },
      currentQuestionIndex: 0,
    });
    expect(missing.status).toBe(400);
    const badId = await put('not-a-uuid', { answers: {}, currentQuestionIndex: 0 });
    expect(badId.status).toBe(400);
  });

  test('saving with no valid answers leaves no row (nothing to continue)', async () => {
    await actAs(student);
    const res = await put(chapterId, { answers: {}, currentQuestionIndex: 0 });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ saved: false, answered: 0 });
    expect(await progressRow(student.id)).toBeNull();
  });

  test('a "Practice mistakes" subset stores its question ids and scopes the attempt to them', async () => {
    await actAs(student);
    const subset = questionIds.slice(0, 3);
    const res = await put(chapterId, {
      // question 5 is in the chapter but outside the subset -> dropped
      answers: { ...answersFor(subset.slice(0, 2)), ...answersFor([questionIds[5]]) },
      currentQuestionIndex: 1,
      questionIds: subset,
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ saved: true, answered: 2, total: 3 });

    const row = await progressRow(student.id);
    expect(row?.question_ids?.slice().sort()).toEqual(subset.slice().sort());
    expect(row?.total_questions).toBe(3);
    expect(row?.answers).toEqual(answersFor(subset.slice(0, 2)));
  });

  test('DELETE discards the saved attempt', async () => {
    await actAs(student);
    await put(chapterId, { answers: answersFor(questionIds.slice(0, 2)), currentQuestionIndex: 1 });
    expect(await progressRow(student.id)).not.toBeNull();

    const res = await del(chapterId);
    expect(res.status).toBe(200);
    expect(await progressRow(student.id)).toBeNull();
    expect((await (await get(chapterId)).json()).progress).toBeNull();
  });

  test("students cannot see each other's progress or write the table directly", async () => {
    const client = await actAs(student);
    await put(chapterId, { answers: answersFor(questionIds.slice(0, 2)), currentQuestionIndex: 1 });

    // Another student sees nothing for the same chapter.
    await actAs(other);
    expect((await (await get(chapterId)).json()).progress).toBeNull();

    // And no direct PostgREST writes: there is no INSERT/UPDATE/DELETE
    // policy (and the grants are revoked) — the API route is the only
    // way in.
    const insert = await client.from('chapter_quiz_progress').insert({
      student_id: student.id,
      chapter_id: otherChapterId,
      subject_id: subjectSlug,
      answers: { '1': 'a' },
      total_questions: 2,
    });
    expect(insert.error).toBeTruthy();
    expect(await progressRow(student.id, otherChapterId)).toBeNull();

    await client
      .from('chapter_quiz_progress')
      .update({ answers: { '1': 'a' } })
      .eq('student_id', student.id);
    // Either an error or zero rows touched — never a changed row.
    expect((await progressRow(student.id))?.answers).toEqual(answersFor(questionIds.slice(0, 2)));
  });

  test('the catalogue reports the unfinished attempt as inProgress ("Continue")', async () => {
    await actAs(student);
    const call = async () => {
      const res = await chaptersBySubjectGet(
        new NextRequest(
          `http://localhost/api/student/catalogue/chapters-by-subject?moduleCode=${encodeURIComponent(
            moduleCode
          )}&subjectSlug=${encodeURIComponent(subjectSlug)}`
        )
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      return body.chapters.find((c: { id: string }) => c.id === chapterId) as {
        attempted: boolean;
        inProgress: { answered: number; total: number } | null;
      };
    };

    expect((await call()).inProgress).toBeNull();

    await put(chapterId, { answers: answersFor(questionIds.slice(0, 4)), currentQuestionIndex: 3 });
    expect(await call()).toMatchObject({ attempted: false, inProgress: { answered: 4, total: 10 } });

    await del(chapterId);
    expect((await call()).inProgress).toBeNull();
  });

  test('submitting turns the attempt into a completed one exactly once: row removed, XP unchanged, nothing double-counted', async () => {
    await actAs(student);
    // Answer 4 of 10, "close the app", come back and finish.
    await put(chapterId, { answers: answersFor(questionIds.slice(0, 4)), currentQuestionIndex: 3 });
    expect(await progressRow(student.id)).not.toBeNull();

    const res = await chapterSubmitPost(
      new NextRequest(`http://localhost/api/student/chapters/${chapterId}/submit`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ answers: answersFor(questionIds) }),
      }),
      params(chapterId)
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ score: 10, total: 10, accuracy: 100 });
    // Identical to an uninterrupted 10/10 run (see chapter-quiz-xp.test.ts).
    expect(body.xpEarned).toBe(150);

    expect(await progressRow(student.id)).toBeNull();

    const { data: sessions } = await admin
      .from('quiz_sessions')
      .select('score, total_questions')
      .eq('student_id', student.id)
      .eq('chapter_id', chapterId);
    expect(sessions).toHaveLength(1);

    const { data: profile } = await admin
      .from('profiles')
      .select('total_xp, total_correct_answers, total_questions_answered')
      .eq('id', student.id)
      .single();
    expect(profile).toMatchObject({
      total_xp: 150,
      total_correct_answers: 10,
      total_questions_answered: 10,
    });

    // And the dashboard shows exactly 10 answered — the 4 saved earlier
    // are not counted again on top of the completed session.
    const stats = await getStats();
    expect(stats.totalQuestionsAnswered).toBe(10);
    expect(stats.totalCorrectAnswers).toBe(10);
    expect(stats.recentChallenges.some((c) => c.inProgress)).toBe(false);
  });

  test('the Progress dashboard counts answers from a chapter that is not finished', async () => {
    await actAs(student);
    // 3 answered: 2 correct, 1 wrong.
    const answers = {
      [String(questionIds[0])]: 'a',
      [String(questionIds[1])]: 'a',
      [String(questionIds[2])]: 'b',
    };
    await put(chapterId, { answers, currentQuestionIndex: 2 });

    const stats = await getStats();
    expect(stats.totalQuestionsAnswered).toBe(3);
    expect(stats.totalCorrectAnswers).toBe(2);
    expect(stats.overallAccuracy).toBeCloseTo(66.7, 1);

    // Shown in Recent Challenges, flagged, with chapter context.
    const unfinished = stats.recentChallenges.find((c) => c.inProgress);
    expect(unfinished).toMatchObject({
      chapterId,
      chapterName: 'Main chapter',
      moduleCode,
      score: 2,
      total: 3,
      questionTotal: 10,
      inProgress: true,
    });

    // The wrong answer is already in the practice-mistakes pool.
    const mistake = stats.mistakes.find((m) => m.chapterId === chapterId);
    expect(mistake?.questionIds).toEqual([questionIds[2]]);
  });
});
