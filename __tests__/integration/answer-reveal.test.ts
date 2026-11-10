// jest.mock() must be written before the imports it affects (ts-jest doesn't hoist).
jest.mock('@/lib/supabase-server', () => {
  const actual = jest.requireActual('@/lib/supabase-server');
  return { ...actual, createRouteHandlerClient: jest.fn() };
});

import { NextRequest } from 'next/server';
import { createRouteHandlerClient } from '@/lib/supabase-server';
import { GET as questionsGet } from '@/app/api/student/chapters/[chapterId]/questions/route';
import { POST as answerPost } from '@/app/api/student/chapters/[chapterId]/answer/route';
import {
  GET as progressGet,
  PUT as progressPut,
} from '@/app/api/student/chapters/[chapterId]/progress/route';
import { POST as submitPost } from '@/app/api/student/chapters/[chapterId]/submit/route';
import { POST as revealsPost } from '@/app/api/student/reveals/route';
import { GET as examGet } from '@/app/api/student/custom-exam/[examId]/route';
import { POST as examAnswerPost } from '@/app/api/student/custom-exam/[examId]/answer/route';
import { POST as examSubmitPost } from '@/app/api/student/custom-exam/[examId]/submit/route';
import {
  GET as bookmarksGet,
  POST as bookmarksPost,
} from '@/app/api/student/bookmarks/route';
import {
  supabaseTestEnvAvailable,
  getServiceRoleClient,
  signInTestUser,
  createTestUser,
  deleteTestUser,
  uniqueSlug,
  type TestUser,
} from '../helpers/supabase-test-env';

const mockRouteClient = createRouteHandlerClient as jest.MockedFunction<
  typeof createRouteHandlerClient
>;

const describeIfSupabase = supabaseTestEnvAvailable() ? describe : describe.skip;

type Json = Record<string, any>;

/**
 * Server-side answer checking (migration 049): the quiz payload carries no
 * answer, one POST .../answer reveals one question, and everything else that
 * shows answers (resume, results, bookmarks) only shows what was revealed.
 */
describeIfSupabase('answer endpoint + question_reveals gate', () => {
  const admin = getServiceRoleClient();
  let student: TestUser;
  let subjectId: string;
  let subjectSlug: string;
  let moduleCode: string;
  let chapterId: string;
  let otherChapterId: string;
  let qIds: number[] = [];
  let otherQuestionId: number;

  async function signIn() {
    const client = await signInTestUser(student.email, student.password);
    mockRouteClient.mockResolvedValue(client as unknown as Awaited<ReturnType<typeof createRouteHandlerClient>>);
  }

  const chapterParams = (id = chapterId) => ({ params: Promise.resolve({ chapterId: id }) });

  function post(path: string, body: unknown) {
    return new NextRequest(`http://localhost${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  async function answer(questionId: number, choice: string, extra: Json = {}, id = chapterId) {
    return answerPost(
      post(`/api/student/chapters/${id}/answer`, {
        questionId,
        choice,
        currentQuestionIndex: 0,
        ...extra,
      }),
      chapterParams(id)
    );
  }

  beforeEach(async () => {
    student = await createTestUser(admin, 'student');

    subjectSlug = uniqueSlug('subject');
    const { data: subject, error: subjectErr } = await admin
      .from('subjects')
      .insert({ slug: subjectSlug, name: subjectSlug })
      .select('id')
      .single();
    if (subjectErr || !subject) throw new Error(`subject fixture failed: ${subjectErr?.message}`);
    subjectId = (subject as { id: string }).id;

    moduleCode = uniqueSlug('module');
    const { error: moduleErr } = await admin
      .from('modules')
      .insert({ code: moduleCode, subject_id: subjectSlug, name: moduleCode });
    if (moduleErr) throw new Error(`module fixture failed: ${moduleErr.message}`);

    async function makeChapter(): Promise<string> {
      const slug = uniqueSlug('chapter');
      const { data, error } = await admin
        .from('chapters')
        .insert({ module_code: moduleCode, subject_id: subjectId, slug, name: slug })
        .select('id')
        .single();
      if (error || !data) throw new Error(`chapter fixture failed: ${error?.message}`);
      return (data as { id: string }).id;
    }
    chapterId = await makeChapter();
    otherChapterId = await makeChapter();

    const row = (chapter: string, i: number) => ({
      chapter_id: chapter,
      subject_id: subjectSlug,
      subject_bundle_id: i + 1,
      question: `Question ${i + 1}`,
      choices: [
        { id: 'a', text: 'Right' },
        { id: 'b', text: 'Wrong' },
      ],
      correct_answer: 'a',
      explanation: `Because of ${i + 1}.`,
      choice_rationales: { a: 'yes', b: 'no' },
      reference: 'Gray p.1',
      reference_page: 5,
      status: 'published',
    });
    const { data: qs, error: qErr } = await admin
      .from('questions')
      .insert([0, 1, 2].map((i) => row(chapterId, i)))
      .select('id');
    if (qErr || !qs) throw new Error(`questions fixture failed: ${qErr?.message}`);
    qIds = (qs as { id: number }[]).map((q) => q.id);

    const { data: oq, error: oqErr } = await admin
      .from('questions')
      .insert(row(otherChapterId, 10))
      .select('id')
      .single();
    if (oqErr || !oq) throw new Error(`other question fixture failed: ${oqErr?.message}`);
    otherQuestionId = (oq as { id: number }).id;

    await signIn();
  });

  afterEach(async () => {
    await admin.from('questions').delete().in('id', [...qIds, otherQuestionId]);
    await admin.from('chapters').delete().in('id', [chapterId, otherChapterId]);
    await admin.from('modules').delete().eq('code', moduleCode);
    await admin.from('subjects').delete().eq('id', subjectId);
    await deleteTestUser(admin, student.id); // cascades progress, reveals, bookmarks, xp
  });

  test('the questions payload carries no answer, explanation or reference', async () => {
    const res = await questionsGet(
      new NextRequest(`http://localhost/api/student/chapters/${chapterId}/questions`),
      chapterParams()
    );
    expect(res.status).toBe(200);
    const body: Json = await res.json();
    expect(body.questions).toHaveLength(3);
    for (const q of body.questions) {
      expect(Object.keys(q).sort()).toEqual(['choices', 'id', 'question', 'topic']);
    }
    expect(JSON.stringify(body)).not.toMatch(/correct|explanation|rationale|Gray/i);
  });

  test('a correct answer is revealed with its explanation and earns 10 XP once', async () => {
    const res = await answer(qIds[0], 'a');
    expect(res.status).toBe(200);
    const body: Json = await res.json();
    expect(body).toMatchObject({
      isCorrect: true,
      chosen: 'a',
      correctAnswer: 'a',
      explanation: 'Because of 1.',
      choiceRationales: { a: 'yes', b: 'no' },
      reference: 'Gray p.1',
      referencePage: 5,
      xpAwarded: 10,
      answered: 1,
      total: 3,
    });

    const { data: reveals } = await admin
      .from('question_reveals')
      .select('question_id')
      .eq('student_id', student.id);
    expect(reveals).toEqual([{ question_id: qIds[0] }]);
  });

  test('a wrong answer is revealed too, with no XP', async () => {
    const body: Json = await (await answer(qIds[1], 'b')).json();
    expect(body).toMatchObject({ isCorrect: false, chosen: 'b', correctAnswer: 'a', xpAwarded: 0 });
  });

  test('answers are final: re-answering keeps the stored answer and returns the same verdict', async () => {
    await answer(qIds[0], 'b'); // wrong first
    const again: Json = await (await answer(qIds[0], 'a')).json(); // tries to change it
    expect(again).toMatchObject({ isCorrect: false, chosen: 'b', xpAwarded: 0, answered: 1 });

    const { data } = await admin
      .from('chapter_quiz_progress')
      .select('answers')
      .eq('student_id', student.id)
      .eq('chapter_id', chapterId)
      .single();
    expect((data as { answers: Json }).answers).toEqual({ [String(qIds[0])]: 'b' });
  });

  test('rejects an invalid choice, an unknown question and a question of another chapter', async () => {
    expect((await answer(qIds[0], 'zzz')).status).toBe(400);
    expect((await answer(999_999_999, 'a')).status).toBe(404);
    expect((await answer(otherQuestionId, 'a')).status).toBe(404);

    const { data } = await admin.from('question_reveals').select('question_id').eq('student_id', student.id);
    expect(data).toEqual([]); // nothing was revealed by the rejected calls
  });

  test('a "practice mistakes" run can only answer its own questions', async () => {
    const res = await answer(qIds[2], 'a', { questionIds: [qIds[0], qIds[1]] });
    expect(res.status).toBe(400);
  });

  test('resuming returns reveals only for questions answered through the endpoint', async () => {
    await answer(qIds[0], 'a');
    // An answer saved without going through the endpoint (the old client's PUT).
    const put = await progressPut(
      new NextRequest(`http://localhost/api/student/chapters/${chapterId}/progress`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ answers: { [String(qIds[1])]: 'b' }, currentQuestionIndex: 1 }),
      }),
      chapterParams()
    );
    expect(put.status).toBe(200);

    const res = await progressGet(
      new NextRequest(`http://localhost/api/student/chapters/${chapterId}/progress`),
      chapterParams()
    );
    const { progress }: Json = await res.json();
    expect(Object.keys(progress.answers).sort()).toEqual([String(qIds[0]), String(qIds[1])].sort());
    // Only the revealed one: a saved guess can't be turned into an answer by reading progress.
    expect(Object.keys(progress.reveals)).toEqual([String(qIds[0])]);
    expect(progress.reveals[String(qIds[0])].correctAnswer).toBe('a');
  });

  test('POST /reveals returns only what this student has been shown', async () => {
    await answer(qIds[0], 'a');
    const res = await revealsPost(
      post('/api/student/reveals', { questionIds: [qIds[0], qIds[1], qIds[2], otherQuestionId] })
    );
    expect(res.status).toBe(200);
    const { reveals }: Json = await res.json();
    expect(Object.keys(reveals)).toEqual([String(qIds[0])]);
  });

  test("another student's reveals do not unlock anything for this one", async () => {
    const other = await createTestUser(admin, 'student');
    try {
      await admin.from('question_reveals').insert({ student_id: other.id, question_id: qIds[2] });
      const res = await revealsPost(post('/api/student/reveals', { questionIds: [qIds[2]] }));
      expect((await res.json()).reveals).toEqual({});
    } finally {
      await deleteTestUser(admin, other.id);
    }
  });

  test('submit returns `correct` only for questions already revealed', async () => {
    await answer(qIds[0], 'a'); // revealed
    const res = await submitPost(
      post(`/api/student/chapters/${chapterId}/submit`, {
        answers: { [String(qIds[0])]: 'a', [String(qIds[1])]: 'b' }, // second one never revealed
      }),
      chapterParams()
    );
    expect(res.status).toBe(200);
    const body: Json = await res.json();
    const byId = new Map<number, Json>(body.results.map((r: Json) => [r.questionId, r]));
    expect(byId.get(qIds[0])).toMatchObject({ correct: 'a', isCorrect: true });
    expect(byId.get(qIds[1])).toMatchObject({ correct: null, isCorrect: false }); // answered, never revealed
    expect(byId.get(qIds[2])).toMatchObject({ correct: null, chosen: null }); // skipped
  });

  test('a bookmark never unlocks the answer; answering does', async () => {
    const bookmarkRes = await bookmarksPost(post('/api/student/bookmarks', { questionId: qIds[0] }));
    expect(bookmarkRes.status).toBe(200);

    const list = async (): Promise<Json> =>
      (await bookmarksGet(new NextRequest('http://localhost/api/student/bookmarks'))).json();

    let { bookmarks } = await list();
    expect(bookmarks).toHaveLength(1);
    expect(bookmarks[0]).toMatchObject({ question: 'Question 1', correctAnswer: null, explanation: '' });

    await answer(qIds[0], 'a');
    ({ bookmarks } = await list());
    expect(bookmarks[0]).toMatchObject({ correctAnswer: 'a', explanation: 'Because of 1.' });
  });

  describe('custom exam', () => {
    let examId: string;
    const examParams = () => ({ params: Promise.resolve({ examId }) });

    beforeEach(async () => {
      const { data, error } = await admin
        .from('custom_exam_progress')
        .insert({
          student_id: student.id,
          module_code: moduleCode,
          chapter_ids: [chapterId],
          question_ids: qIds,
          total_questions: qIds.length,
        })
        .select('id')
        .single();
      if (error || !data) throw new Error(`exam fixture failed: ${error?.message}`);
      examId = (data as { id: string }).id;
    });

    const examAnswer = (questionId: number, choice: string) =>
      examAnswerPost(
        post(`/api/student/custom-exam/${examId}/answer`, {
          questionId,
          choice,
          currentQuestionIndex: 1,
        }),
        examParams()
      );

    test('the exam payload carries no answers; reveals appear once answered', async () => {
      const getExam = async (): Promise<Json> =>
        (
          await examGet(
            new NextRequest(`http://localhost/api/student/custom-exam/${examId}`),
            examParams()
          )
        ).json();

      let body = await getExam();
      expect(body.questions).toHaveLength(3);
      expect(Object.keys(body.questions[0]).sort()).toEqual(
        ['chapterId', 'chapterName', 'choices', 'id', 'question', 'subjectName', 'topic'].sort()
      );
      expect(JSON.stringify(body.questions)).not.toMatch(/correct|explanation|rationale|Gray/i);
      expect(body.progress.reveals).toEqual({});

      const res = await examAnswer(qIds[0], 'a');
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({
        isCorrect: true,
        chosen: 'a',
        correctAnswer: 'a',
        explanation: 'Because of 1.',
        referencePage: 5,
        xpAwarded: 10,
        answered: 1,
        total: 3,
      });

      body = await getExam();
      expect(body.progress.answers).toEqual({ [String(qIds[0])]: 'a' });
      expect(Object.keys(body.progress.reveals)).toEqual([String(qIds[0])]);
    });

    test('answers are final and only exam questions can be answered', async () => {
      await examAnswer(qIds[0], 'b');
      const again: Json = await (await examAnswer(qIds[0], 'a')).json();
      expect(again).toMatchObject({ isCorrect: false, chosen: 'b', xpAwarded: 0, answered: 1 });

      expect((await examAnswer(otherQuestionId, 'a')).status).toBe(400); // not in this exam
      expect((await examAnswer(qIds[1], 'zzz')).status).toBe(400); // not a choice
    });

    test('submit returns `correct` only for questions already revealed', async () => {
      await examAnswer(qIds[0], 'a');
      const res = await examSubmitPost(
        post(`/api/student/custom-exam/${examId}/submit`, {
          answers: { [String(qIds[1])]: 'b' }, // saved by the submit itself, never revealed
        }),
        examParams()
      );
      expect(res.status).toBe(200);
      const body: Json = await res.json();
      const byId = new Map<number, Json>(body.results.map((r: Json) => [r.questionId, r]));
      expect(byId.get(qIds[0])).toMatchObject({ correct: 'a', isCorrect: true });
      expect(byId.get(qIds[1])).toMatchObject({ correct: null, isCorrect: false });
      expect(byId.get(qIds[2])).toMatchObject({ correct: null, chosen: null });
    });
  });
});
