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
  GET as studentFlagGet,
  POST as studentFlagPost,
} from '@/app/api/student/questions/[questionId]/flag/route';
import { GET as adminFlagsGet } from '@/app/api/admin/content/flags/route';
import { PATCH as adminFlagPatch } from '@/app/api/admin/content/flags/[flagId]/route';
import { GET as overviewGet } from '@/app/api/admin/content/overview/route';
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

/**
 * Student question reports (question_flags): the student flag route
 * (GET status / POST report), the admin list + resolve routes, the
 * overview's openReports count, and the RLS underneath
 * (033_question_flag_admin.sql). Real database, same pattern as
 * chapter-quiz-progress.test.ts; only the cookie-bound client factory
 * is mocked. Self-contained fixtures, cleaned up afterwards.
 */
describeIfSupabase('question flags (report a question)', () => {
  const admin = getServiceRoleClient();
  let student: TestUser;
  let other: TestUser;
  let adminUser: TestUser;
  let subjectId: string;
  let subjectSlug: string;
  let moduleCode: string;
  let chapterId: string;
  let publishedQid: number;
  let draftQid: number;

  beforeEach(async () => {
    student = await createTestUser(admin, 'student');
    other = await createTestUser(admin, 'student');
    adminUser = await createTestUser(admin, 'admin');
    // Signup can't self-assign admin (the profile is created as a student);
    // promote through the service role, as the real admin-promotion path does.
    const promoted = await admin.from('profiles').update({ role: 'admin' }).eq('id', adminUser.id);
    if (promoted.error) throw new Error(`admin promotion failed: ${promoted.error.message}`);

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

    const { data: chapter, error: chapterErr } = await admin
      .from('chapters')
      .insert({
        module_code: moduleCode,
        subject_id: subjectId,
        slug: uniqueSlug('chapter'),
        name: 'Flag chapter',
      })
      .select('id')
      .single();
    if (chapterErr || !chapter) throw new Error(`chapter fixture failed: ${chapterErr?.message}`);
    chapterId = (chapter as { id: string }).id;

    const { data: qs, error: qErr } = await admin
      .from('questions')
      .insert([
        {
          chapter_id: chapterId,
          subject_id: subjectSlug,
          subject_bundle_id: 1,
          question: 'Published flag-test question',
          choices: [
            { id: 'a', text: 'Correct' },
            { id: 'b', text: 'Wrong' },
          ],
          correct_answer: 'a',
          topic: 'Flag topic',
          status: 'published',
        },
        {
          chapter_id: chapterId,
          subject_id: subjectSlug,
          subject_bundle_id: 2,
          question: 'Draft flag-test question',
          choices: [
            { id: 'a', text: 'Correct' },
            { id: 'b', text: 'Wrong' },
          ],
          correct_answer: 'a',
          topic: 'Flag topic 2',
          status: 'draft',
        },
      ])
      .select('id, status');
    if (qErr || !qs) throw new Error(`questions fixture failed: ${qErr?.message}`);
    const rows = qs as { id: number; status: string }[];
    publishedQid = rows.find((r) => r.status === 'published')!.id;
    draftQid = rows.find((r) => r.status === 'draft')!.id;
  });

  afterEach(async () => {
    // question_flags rows go with the questions (ON DELETE CASCADE).
    await admin.from('questions').delete().in('id', [publishedQid, draftQid]);
    await admin.from('chapters').delete().eq('id', chapterId);
    await admin.from('modules').delete().eq('code', moduleCode);
    await admin.from('subjects').delete().eq('id', subjectId);
    await deleteTestUser(admin, student.id);
    await deleteTestUser(admin, other.id);
    await deleteTestUser(admin, adminUser.id);
  });

  async function actAs(user: TestUser) {
    const client = await signInTestUser(user.email, user.password);
    mockCreateRouteHandlerClient.mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createRouteHandlerClient>>
    );
    return client;
  }

  function actAsAnonymous() {
    mockCreateRouteHandlerClient.mockResolvedValue(
      getAnonClient() as unknown as Awaited<ReturnType<typeof createRouteHandlerClient>>
    );
  }

  function flagUrl(qid: number) {
    return `http://localhost/api/student/questions/${qid}/flag`;
  }

  async function getStatus(qid: number) {
    return studentFlagGet(new NextRequest(flagUrl(qid)), {
      params: Promise.resolve({ questionId: String(qid) }),
    });
  }

  async function report(qid: number, body: unknown) {
    return studentFlagPost(
      new NextRequest(flagUrl(qid), {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
      }),
      { params: Promise.resolve({ questionId: String(qid) }) }
    );
  }

  async function flagCount(qid: number): Promise<number> {
    const { data } = await admin.from('questions').select('flag_count').eq('id', qid).single();
    return (data as { flag_count: number }).flag_count;
  }

  async function adminList(status = 'open') {
    return adminFlagsGet(
      new NextRequest(`http://localhost/api/admin/content/flags?status=${status}`)
    );
  }

  async function adminResolve(flagId: string, resolved: boolean) {
    return adminFlagPatch(
      new NextRequest(`http://localhost/api/admin/content/flags/${flagId}`, {
        method: 'PATCH',
        body: JSON.stringify({ resolved }),
        headers: { 'Content-Type': 'application/json' },
      }),
      { params: Promise.resolve({ flagId }) }
    );
  }

  test('a student can report a question once; status and flag_count follow', async () => {
    await actAs(student);

    expect(await (await getStatus(publishedQid)).json()).toEqual({ flagged: false });

    const first = await report(publishedQid, { reason: 'wrong_answer', detail: '  key looks wrong ' });
    expect(first.status).toBe(201);
    expect(await flagCount(publishedQid)).toBe(1);
    expect(await (await getStatus(publishedQid)).json()).toEqual({ flagged: true });

    const stored = await admin
      .from('question_flags')
      .select('reason, detail, resolved, student_id')
      .eq('question_id', publishedQid)
      .single();
    expect(stored.data).toEqual({
      reason: 'wrong_answer',
      detail: 'key looks wrong',
      resolved: false,
      student_id: student.id,
    });

    const again = await report(publishedQid, { reason: 'typo' });
    expect(again.status).toBe(409);
    expect(await again.json()).toEqual({ error: 'already_reported' });
    expect(await flagCount(publishedQid)).toBe(1);
  });

  test('an empty detail is stored as NULL', async () => {
    await actAs(student);
    const res = await report(publishedQid, { reason: 'other', detail: '   ' });
    expect(res.status).toBe(201);
    const stored = await admin
      .from('question_flags')
      .select('detail')
      .eq('question_id', publishedQid)
      .single();
    expect((stored.data as { detail: string | null }).detail).toBeNull();
  });

  test('rejects bad payloads, unknown questions and unpublished questions', async () => {
    await actAs(student);

    expect((await report(publishedQid, { reason: 'spam' })).status).toBe(400);
    expect((await report(publishedQid, {})).status).toBe(400);
    expect(
      (await report(publishedQid, { reason: 'other', detail: 'x'.repeat(1001) })).status
    ).toBe(400);
    expect((await report(2_000_000_000, { reason: 'typo' })).status).toBe(404);
    // RLS hides non-published questions from students, so a draft can't be reported.
    expect((await report(draftQid, { reason: 'typo' })).status).toBe(404);

    const none = await admin
      .from('question_flags')
      .select('id')
      .in('question_id', [publishedQid, draftQid]);
    expect(none.data).toEqual([]);
  });

  test('rejects anonymous callers and non-students on the student route', async () => {
    actAsAnonymous();
    expect((await report(publishedQid, { reason: 'typo' })).status).toBe(401);
    expect((await getStatus(publishedQid)).status).toBe(401);

    await actAs(adminUser);
    expect((await report(publishedQid, { reason: 'typo' })).status).toBe(403);
  });

  test("one student's report is invisible to another student", async () => {
    await actAs(student);
    expect((await report(publishedQid, { reason: 'typo' })).status).toBe(201);

    await actAs(other);
    expect(await (await getStatus(publishedQid)).json()).toEqual({ flagged: false });
  });

  test('admin sees the report with reporter + question context; students and anon cannot list', async () => {
    await actAs(student);
    await report(publishedQid, { reason: 'ambiguous', detail: 'two answers fit' });

    await actAs(adminUser);
    const res = await adminList('open');
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      flags: {
        id: string;
        questionId: number;
        reason: string;
        detail: string | null;
        reporter: { email: string | null } | null;
        question: { text: string; chapterName: string | null; moduleCode: string | null } | null;
      }[];
      counts: { open: number; resolved: number };
    };
    const mine = body.flags.find((f) => f.questionId === publishedQid);
    expect(mine).toBeDefined();
    expect(mine!.reason).toBe('ambiguous');
    expect(mine!.detail).toBe('two answers fit');
    expect(mine!.reporter?.email).toBe(student.email);
    expect(mine!.question?.text).toBe('Published flag-test question');
    expect(mine!.question?.chapterName).toBe('Flag chapter');
    expect(mine!.question?.moduleCode).toBe(moduleCode);
    expect(body.counts.open).toBeGreaterThanOrEqual(1);

    expect((await adminList('bogus')).status).toBe(400);

    await actAs(student);
    expect((await adminList()).status).toBe(403);
    actAsAnonymous();
    expect((await adminList()).status).toBe(401);
  });

  test('admin can resolve and reopen; flag_count tracks unresolved reports only', async () => {
    await actAs(student);
    await report(publishedQid, { reason: 'wrong_answer' });
    const { data: row } = await admin
      .from('question_flags')
      .select('id')
      .eq('question_id', publishedQid)
      .single();
    const flagId = (row as { id: string }).id;
    expect(await flagCount(publishedQid)).toBe(1);

    await actAs(adminUser);
    const resolved = await adminResolve(flagId, true);
    expect(resolved.status).toBe(200);
    expect(await flagCount(publishedQid)).toBe(0);
    const after = await admin
      .from('question_flags')
      .select('resolved, resolved_by, resolved_at')
      .eq('id', flagId)
      .single();
    const afterRow = after.data as {
      resolved: boolean;
      resolved_by: string | null;
      resolved_at: string | null;
    };
    expect(afterRow.resolved).toBe(true);
    expect(afterRow.resolved_by).toBe(adminUser.id);
    expect(afterRow.resolved_at).not.toBeNull();

    // Resolved reports leave the open list but stay in the resolved one.
    const open = (await (await adminList('open')).json()) as { flags: { id: string }[] };
    expect(open.flags.some((f) => f.id === flagId)).toBe(false);
    const done = (await (await adminList('resolved')).json()) as { flags: { id: string }[] };
    expect(done.flags.some((f) => f.id === flagId)).toBe(true);

    const reopened = await adminResolve(flagId, false);
    expect(reopened.status).toBe(200);
    expect(await flagCount(publishedQid)).toBe(1);
    const reopenedRow = await admin
      .from('question_flags')
      .select('resolved, resolved_by, resolved_at')
      .eq('id', flagId)
      .single();
    expect(reopenedRow.data).toEqual({ resolved: false, resolved_by: null, resolved_at: null });

    expect((await adminResolve('00000000-0000-0000-0000-000000000000', true)).status).toBe(404);
    expect((await adminResolve('not-a-uuid', true)).status).toBe(400);
  });

  test('students cannot resolve reports through the route or straight through RLS', async () => {
    const studentClient = await actAs(student);
    await report(publishedQid, { reason: 'typo' });
    const { data: row } = await admin
      .from('question_flags')
      .select('id')
      .eq('question_id', publishedQid)
      .single();
    const flagId = (row as { id: string }).id;

    expect((await adminResolve(flagId, true)).status).toBe(403);

    // Direct PostgREST UPDATE as the reporting student: no UPDATE policy,
    // so zero rows are affected and the flag stays open.
    await studentClient.from('question_flags').update({ resolved: true }).eq('id', flagId);
    const still = await admin.from('question_flags').select('resolved').eq('id', flagId).single();
    expect((still.data as { resolved: boolean }).resolved).toBe(false);

    // ...and a student can't report as someone else.
    const forged = await studentClient
      .from('question_flags')
      .insert({ question_id: publishedQid, student_id: other.id, reason: 'typo' });
    expect(forged.error).not.toBeNull();
  });

  test('the admin overview counts open reports', async () => {
    await actAs(adminUser);
    const before = (await (await overviewGet()).json()) as { counts: { openReports: number } };

    await actAs(student);
    await report(publishedQid, { reason: 'typo' });

    await actAs(adminUser);
    const afterRes = await overviewGet();
    expect(afterRes.status).toBe(200);
    const after = (await afterRes.json()) as { counts: { openReports: number } };
    expect(after.counts.openReports).toBe(before.counts.openReports + 1);
  });
});
