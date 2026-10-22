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
import { GET as examGet } from '@/app/api/student/custom-exam/[examId]/route';
import { PUT as progressPut } from '@/app/api/student/custom-exam/[examId]/progress/route';
import { POST as submitPost } from '@/app/api/student/custom-exam/[examId]/submit/route';
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
 * Big modules (production's 309 has ~1,500 published questions across 61
 * chapters; 310 has ~950) exceed the 1,000-row cap PostgREST applies to
 * every response and truncates SILENTLY. If the exam routes did not page
 * their reads, such a module would quietly report — and draw from — only
 * the first 1,000 questions. This builds a pool larger than the cap and
 * proves nothing is lost. Real database.
 */
describeIfSupabase('custom exam — pools larger than the 1,000-row API cap', () => {
  const admin = getServiceRoleClient();
  let student: TestUser;
  let client: SupabaseClient;

  const subjectIds: string[] = [];
  let moduleCode: string;
  const chapterIds: string[] = [];
  const questionIds: number[] = [];
  const PER_CHAPTER = [650, 650]; // 1,300 published — over the cap, across two chapters
  const POOL = PER_CHAPTER.reduce((a, b) => a + b, 0);

  beforeAll(async () => {
    student = await createTestUser(admin, 'student');
    client = await signInTestUser(student.email, student.password);

    const slug = uniqueSlug('scale-subject');
    const { data: subj, error: sErr } = await admin
      .from('subjects')
      .insert({ slug, name: 'Scale subject' })
      .select('id')
      .single();
    if (sErr || !subj) throw new Error(`subject fixture failed: ${sErr?.message}`);
    subjectIds.push((subj as { id: string }).id);

    // Module codes are capped at 32 chars by the create route (real ones are
    // 3 chars, e.g. "309"), so keep the fixture's short.
    moduleCode = uniqueSlug('sm');
    const { error: mErr } = await admin
      .from('modules')
      .insert({ code: moduleCode, subject_id: slug, name: `Module ${moduleCode}` });
    if (mErr) throw new Error(`module fixture failed: ${mErr.message}`);
    await admin
      .from('module_subjects')
      .insert({ module_code: moduleCode, subject_id: (subj as { id: string }).id });

    for (const [i, count] of PER_CHAPTER.entries()) {
      const { data: ch, error } = await admin
        .from('chapters')
        .insert({
          module_code: moduleCode,
          subject_id: (subj as { id: string }).id,
          slug: uniqueSlug(`ch${i}`),
          name: `Big chapter ${i + 1}`,
          ordinal: i + 1,
        })
        .select('id')
        .single();
      if (error || !ch) throw new Error(`chapter fixture failed: ${error?.message}`);
      const chapterId = (ch as { id: string }).id;
      chapterIds.push(chapterId);

      // Insert in batches so a single request stays small.
      for (let start = 0; start < count; start += 250) {
        const rows = Array.from({ length: Math.min(250, count - start) }, (_, k) => ({
          chapter_id: chapterId,
          subject_id: slug,
          subject_bundle_id: Math.floor(Math.random() * 2e9),
          question: `Big ${i + 1}-${start + k}`,
          choices: [
            { id: 'a', text: 'A' },
            { id: 'b', text: 'B' },
          ],
          correct_answer: 'a',
          topic: `t${start + k}`,
          status: 'published',
        }));
        const { data, error: qErr } = await admin.from('questions').insert(rows).select('id');
        if (qErr || !data) throw new Error(`questions fixture failed: ${qErr?.message}`);
        questionIds.push(...(data as { id: number }[]).map((q) => q.id));
      }
    }
  }, 120_000);

  afterAll(async () => {
    await admin.from('quiz_sessions').delete().eq('student_id', student.id);
    await admin.from('custom_exam_progress').delete().eq('student_id', student.id);
    for (let i = 0; i < questionIds.length; i += 500) {
      await admin.from('questions').delete().in('id', questionIds.slice(i, i + 500));
    }
    await admin.from('chapters').delete().eq('module_code', moduleCode);
    await admin.from('module_subjects').delete().eq('module_code', moduleCode);
    await admin.from('modules').delete().eq('code', moduleCode);
    await admin.from('subjects').delete().in('id', subjectIds);
    await deleteTestUser(admin, student.id);
  }, 120_000);

  function create(count: number) {
    actAs(client);
    return createPost(req('POST', '/api/student/custom-exam', { moduleCode, chapterIds, count }));
  }

  test('the whole pool is available: asking for every question succeeds', async () => {
    const res = await create(POOL);
    expect(res.status).toBe(200);
    const { examId, total } = await res.json();
    expect(total).toBe(POOL);
    const { data } = await admin.from('custom_exam_progress').select('question_ids').eq('id', examId).single();
    const ids = (data as { question_ids: number[] }).question_ids;
    expect(ids).toHaveLength(POOL);
    expect(new Set(ids).size).toBe(POOL); // distinct
    expect(new Set(ids)).toEqual(new Set(questionIds)); // and it is exactly the pool
  });

  test('one more than exists is rejected with the TRUE available count (not capped at 1,000)', async () => {
    const res = await create(POOL + 1);
    expect(res.status).toBe(400);
    expect((await res.json()).available).toBe(POOL);
  });

  test('loading, saving and submitting an exam bigger than the cap loses nothing', async () => {
    const { examId } = await (await create(POOL)).json();

    actAs(client);
    const exam = await examGet(req('GET', `/api/student/custom-exam/${examId}`), {
      params: Promise.resolve({ examId }),
    });
    expect(exam.status).toBe(200);
    const body = (await exam.json()) as { questionTotal: number; questions: { id: number }[] };
    expect(body.questionTotal).toBe(POOL);
    expect(body.questions).toHaveLength(POOL);

    // Answer every question correctly and save in one snapshot.
    const answers = Object.fromEntries(body.questions.map((q) => [String(q.id), 'a']));
    actAs(client);
    const saved = await progressPut(
      req('PUT', `/api/student/custom-exam/${examId}/progress`, { answers, currentQuestionIndex: POOL - 1 }),
      { params: Promise.resolve({ examId }) }
    );
    expect(saved.status).toBe(200);
    expect((await saved.json()).answered).toBe(POOL);

    actAs(client);
    const submit = await submitPost(req('POST', `/api/student/custom-exam/${examId}/submit`, {}), {
      params: Promise.resolve({ examId }),
    });
    expect(submit.status).toBe(200);
    const result = await submit.json();
    expect(result).toMatchObject({ score: POOL, total: POOL, accuracy: 100 });
    expect(result.results).toHaveLength(POOL);
  }, 120_000);
});
