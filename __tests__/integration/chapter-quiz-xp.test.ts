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
import { POST as chapterSubmitPost } from '@/app/api/student/chapters/[chapterId]/submit/route';
import { GET as leaderboardGet } from '@/app/api/student/leaderboard/route';
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
 * End-to-end check of the leaderboard XP path introduced in this
 * feature: POST /api/student/chapters/[chapterId]/submit -> the
 * calculateSessionXp() formula -> the record_quiz_result() RPC ->
 * profiles.total_xp -> GET /api/student/leaderboard. Uses a fresh,
 * self-contained subject/module/chapter/questions fixture (not real
 * content) so this never depends on — or risks corrupting — actual
 * published question banks. Same real-database pattern as
 * require-admin.test.ts: only next/headers' cookies() is mocked
 * (via createRouteHandlerClient), Supabase itself never is.
 */
describeIfSupabase('chapter-quiz XP + leaderboard', () => {
  const admin = getServiceRoleClient();
  let student: TestUser;
  let subjectId: string;
  let subjectSlug: string;
  let moduleCode: string;
  let chapterId: string;
  let questionIds: number[] = [];

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

    const chapterSlug = uniqueSlug('chapter');
    const { data: chapter, error: chapterErr } = await admin
      .from('chapters')
      .insert({ module_code: moduleCode, subject_id: subjectId, slug: chapterSlug, name: chapterSlug })
      .select('id')
      .single();
    if (chapterErr || !chapter) throw new Error(`chapter fixture failed: ${chapterErr?.message}`);
    chapterId = (chapter as { id: string }).id;

    const rows = Array.from({ length: 10 }, (_, i) => ({
      chapter_id: chapterId,
      subject_id: subjectSlug,
      subject_bundle_id: i + 1,
      question: `Test question ${i + 1}`,
      choices: [
        { id: 'a', text: 'Correct' },
        { id: 'b', text: 'Wrong' },
      ],
      correct_answer: 'a',
      status: 'published',
    }));
    const { data: qs, error: qErr } = await admin.from('questions').insert(rows).select('id');
    if (qErr || !qs) throw new Error(`questions fixture failed: ${qErr?.message}`);
    questionIds = (qs as { id: number }[]).map((q) => q.id);
  });

  afterEach(async () => {
    await admin.from('questions').delete().in('id', questionIds);
    await admin.from('chapters').delete().eq('id', chapterId);
    await admin.from('modules').delete().eq('code', moduleCode);
    await admin.from('subjects').delete().eq('id', subjectId);
    await deleteTestUser(admin, student.id); // cascades profiles -> daily_streaks
  });

  function submitRequest(answers: Record<string, string>): NextRequest {
    return new NextRequest(`http://localhost/api/student/chapters/${chapterId}/submit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ answers }),
    });
  }

  test('an all-correct submission earns bonus XP and shows up on the leaderboard', async () => {
    const client = await signInTestUser(student.email, student.password);
    mockCreateRouteHandlerClient.mockResolvedValue(client as unknown as Awaited<ReturnType<typeof createRouteHandlerClient>>);

    const answers = Object.fromEntries(questionIds.map((id) => [String(id), 'a']));
    const res = await chapterSubmitPost(submitRequest(answers), {
      params: Promise.resolve({ chapterId }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.score).toBe(10);
    expect(body.total).toBe(10);
    expect(body.accuracy).toBe(100);
    expect(body.xpEarned).toBe(150); // 10 correct * 10 XP * 1.5 accuracy bonus

    const lbRes = await leaderboardGet();
    expect(lbRes.status).toBe(200);
    const lb = await lbRes.json();
    expect(lb.me).toBeTruthy();
    expect(lb.me.id).toBe(student.id);
    expect(lb.me.total_xp).toBe(150);
    expect(lb.me.total_correct_answers).toBe(10);
    expect(lb.me.total_questions_answered).toBe(10);
  });

  test('a below-bonus-threshold submission earns flat-rate XP only', async () => {
    const client = await signInTestUser(student.email, student.password);
    mockCreateRouteHandlerClient.mockResolvedValue(client as unknown as Awaited<ReturnType<typeof createRouteHandlerClient>>);

    // 6/10 correct = 60% accuracy, below the 90% bonus threshold.
    const answers: Record<string, string> = {};
    questionIds.forEach((id, i) => {
      answers[String(id)] = i < 6 ? 'a' : 'b';
    });
    const res = await chapterSubmitPost(submitRequest(answers), {
      params: Promise.resolve({ chapterId }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.score).toBe(6);
    expect(body.accuracy).toBe(60);
    expect(body.xpEarned).toBe(60); // 6 correct * 10 XP, no bonus
  });

  test('rejects an unauthenticated submission with 401 and awards no XP', async () => {
    const { getAnonClient } = await import('../helpers/supabase-test-env');
    mockCreateRouteHandlerClient.mockResolvedValue(getAnonClient() as unknown as Awaited<ReturnType<typeof createRouteHandlerClient>>);

    const answers = Object.fromEntries(questionIds.map((id) => [String(id), 'a']));
    const res = await chapterSubmitPost(submitRequest(answers), {
      params: Promise.resolve({ chapterId }),
    });
    expect(res.status).toBe(401);

    const { data: profile } = await admin.from('profiles').select('total_xp').eq('id', student.id).single();
    expect((profile as { total_xp: number }).total_xp).toBe(0);
  });
});
