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
import { POST as chaptersPost } from '@/app/api/admin/content/chapters/route';
import { GET as questionsGet } from '@/app/api/admin/content/questions/route';
import { POST as bulkPost } from '@/app/api/admin/content/questions/bulk/route';
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
 * Chapter split tools (migration 042 + admin routes): insert a chapter
 * after another one (later chapters shift down, topic/book/page are
 * inherited), list a chapter's questions in student order, and move
 * questions between chapters with counts kept right. Real local DB;
 * only the cookie-bound client factory is mocked.
 */
describeIfSupabase('admin chapter split tools', () => {
  const admin = getServiceRoleClient();
  let adminUser: TestUser;
  let student: TestUser;
  let subjectId: string;
  let subjectSlug: string;
  let otherSubjectId: string;
  let moduleCode: string;
  let bookId: string;
  let ch1: string;
  let ch2: string;
  let ch3: string;
  let otherChapter: string;
  let questionIds: number[] = [];
  const createdChapterIds: string[] = [];

  beforeEach(async () => {
    adminUser = await createTestUser(admin, 'admin');
    student = await createTestUser(admin, 'student');

    subjectSlug = uniqueSlug('subject');
    const subj = await admin.from('subjects').insert({ slug: subjectSlug, name: `Subject ${subjectSlug}` }).select('id').single();
    if (subj.error) throw new Error(`subject fixture: ${subj.error.message}`);
    subjectId = (subj.data as { id: string }).id;

    const otherSlug = uniqueSlug('subject');
    const other = await admin.from('subjects').insert({ slug: otherSlug, name: `Subject ${otherSlug}` }).select('id').single();
    if (other.error) throw new Error(`other subject fixture: ${other.error.message}`);
    otherSubjectId = (other.data as { id: string }).id;

    moduleCode = uniqueSlug('module');
    const mod = await admin.from('modules').insert({ code: moduleCode, subject_id: subjectSlug, name: `Module ${moduleCode}` });
    if (mod.error) throw new Error(`module fixture: ${mod.error.message}`);

    const book = await admin.from('reference_books').insert({ title: `Book ${uniqueSlug('book')}` }).select('id').single();
    if (book.error) throw new Error(`book fixture: ${book.error.message}`);
    bookId = (book.data as { id: string }).id;

    const chs = await admin
      .from('chapters')
      .insert([
        { module_code: moduleCode, subject_id: subjectId, slug: uniqueSlug('c1'), name: 'Spinal cord', ordinal: 1, topic: 'Spinal cord', default_book_id: bookId, default_page_start: 40 },
        { module_code: moduleCode, subject_id: subjectId, slug: uniqueSlug('c2'), name: 'Brain stem', ordinal: 2, topic: 'Brain stem' },
        { module_code: moduleCode, subject_id: subjectId, slug: uniqueSlug('c3'), name: 'Cerebellum', ordinal: 3, topic: 'Cerebellum' },
        { module_code: moduleCode, subject_id: otherSubjectId, slug: uniqueSlug('x1'), name: 'Other subject chapter', ordinal: 1 },
      ])
      .select('id, ordinal, subject_id');
    if (chs.error) throw new Error(`chapters fixture: ${chs.error.message}`);
    const rows = chs.data as { id: string; ordinal: number; subject_id: string }[];
    ch1 = rows.find((r) => r.subject_id === subjectId && r.ordinal === 1)!.id;
    ch2 = rows.find((r) => r.subject_id === subjectId && r.ordinal === 2)!.id;
    ch3 = rows.find((r) => r.subject_id === subjectId && r.ordinal === 3)!.id;
    otherChapter = rows.find((r) => r.subject_id === otherSubjectId)!.id;

    const qs = await admin
      .from('questions')
      .insert(
        [1, 2, 3, 4].map((n) => ({
          chapter_id: ch1,
          subject_id: subjectSlug,
          subject_bundle_id: n,
          question: `Split question ${n}`,
          choices: [
            { id: 'a', text: 'Right' },
            { id: 'b', text: 'Wrong' },
          ],
          correct_answer: 'a',
          topic: 'Spinal cord',
          status: n === 4 ? 'draft' : 'published',
        }))
      )
      .select('id');
    if (qs.error) throw new Error(`questions fixture: ${qs.error.message}`);
    questionIds = (qs.data as { id: number }[]).map((q) => q.id).sort((a, b) => a - b);
  });

  afterEach(async () => {
    await admin.from('questions').delete().in('id', questionIds);
    await admin.from('chapters').delete().in('id', [ch1, ch2, ch3, otherChapter, ...createdChapterIds.splice(0)]);
    await admin.from('reference_books').delete().eq('id', bookId);
    await admin.from('modules').delete().eq('code', moduleCode);
    await admin.from('subjects').delete().in('id', [subjectId, otherSubjectId]);
    await deleteTestUser(admin, adminUser.id);
    await deleteTestUser(admin, student.id);
  });

  async function actAs(user: TestUser) {
    const client = await signInTestUser(user.email, user.password);
    mockCreateRouteHandlerClient.mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createRouteHandlerClient>>
    );
    return client;
  }

  function post(url: string, body: unknown) {
    return new NextRequest(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  async function ordinals(): Promise<Record<string, number>> {
    const { data } = await admin.from('chapters').select('id, ordinal').eq('module_code', moduleCode).eq('subject_id', subjectId);
    return Object.fromEntries((data as { id: string; ordinal: number }[]).map((r) => [r.id, r.ordinal]));
  }

  it('inserts after a chapter, shifts later chapters down, and inherits topic, book and page', async () => {
    await actAs(adminUser);
    const res = await chaptersPost(
      post('http://localhost/api/admin/content/chapters', {
        moduleCode,
        subjectId,
        name: 'Spinal cord (Part 2)',
        afterChapterId: ch1,
      })
    );
    expect(res.status).toBe(201);
    const { chapter } = (await res.json()) as { chapter: { id: string; ordinal: number } };
    createdChapterIds.push(chapter.id);
    expect(chapter.ordinal).toBe(2);

    const ord = await ordinals();
    expect(ord[ch1]).toBe(1);
    expect(ord[chapter.id]).toBe(2);
    expect(ord[ch2]).toBe(3);
    expect(ord[ch3]).toBe(4);
    // Contiguous, no duplicates.
    expect(Object.values(ord).sort((a, b) => a - b)).toEqual([1, 2, 3, 4]);

    const { data: created } = await admin.from('chapters').select('topic, default_book_id, default_page_start').eq('id', chapter.id).single();
    expect(created).toEqual({ topic: 'Spinal cord', default_book_id: bookId, default_page_start: 40 });

    // The other subject's chapter in the same module is untouched.
    const { data: otherRow } = await admin.from('chapters').select('ordinal').eq('id', otherChapter).single();
    expect((otherRow as { ordinal: number }).ordinal).toBe(1);
  });

  it('still appends at the end when no position is given (no shift)', async () => {
    await actAs(adminUser);
    const res = await chaptersPost(post('http://localhost/api/admin/content/chapters', { moduleCode, subjectId, name: 'Blood supply' }));
    expect(res.status).toBe(201);
    const { chapter } = (await res.json()) as { chapter: { id: string; ordinal: number } };
    createdChapterIds.push(chapter.id);
    expect(chapter.ordinal).toBe(4);
    const ord = await ordinals();
    expect([ord[ch1], ord[ch2], ord[ch3]]).toEqual([1, 2, 3]);
  });

  it('rejects afterChapterId from a different subject', async () => {
    await actAs(adminUser);
    const res = await chaptersPost(
      post('http://localhost/api/admin/content/chapters', { moduleCode, subjectId, name: 'Wrong place', afterChapterId: otherChapter })
    );
    expect(res.status).toBe(400);
    expect(Object.values(await ordinals()).sort()).toEqual([1, 2, 3]);
  });

  it('returns 409 with a clear message for a duplicate chapter name, and rolls the shift back', async () => {
    await actAs(adminUser);
    const body = { moduleCode, subjectId, name: 'Spinal cord (Part 2)', afterChapterId: ch1 };
    const first = await chaptersPost(post('http://localhost/api/admin/content/chapters', body));
    expect(first.status).toBe(201);
    const { chapter } = (await first.json()) as { chapter: { id: string } };
    createdChapterIds.push(chapter.id);

    // Same name → same slug → unique violation on (module, subject, slug).
    const dup = await chaptersPost(post('http://localhost/api/admin/content/chapters', body));
    expect(dup.status).toBe(409);
    expect(((await dup.json()) as { error: string }).error).toMatch(/already exists/);
    // The failed insert rolled back its shift: positions are as after the first insert.
    expect(await ordinals()).toEqual({ [ch1]: 1, [chapter.id]: 2, [ch2]: 3, [ch3]: 4 });
  });

  it('refuses students: through the route and when calling the function directly', async () => {
    await actAs(student);
    const res = await chaptersPost(post('http://localhost/api/admin/content/chapters', { moduleCode, subjectId, name: 'Sneaky', afterChapterId: ch1 }));
    expect(res.status).toBe(403);

    const studentClient = await signInTestUser(student.email, student.password);
    const rpc = await studentClient.rpc('admin_insert_chapter_at', {
      p_module_code: moduleCode,
      p_subject_id: subjectId,
      p_name: 'Sneaky RPC',
      p_slug: uniqueSlug('sneaky'),
      p_ordinal: 1,
    });
    expect(rpc.error).not.toBeNull();
    expect(await ordinals()).toEqual({ [ch1]: 1, [ch2]: 2, [ch3]: 3 });
  });

  it('lists a chapter in student order (id ascending) with order=position', async () => {
    await actAs(adminUser);
    const res = await questionsGet(
      new NextRequest(`http://localhost/api/admin/content/questions?chapterId=${ch1}&order=position&limit=500`)
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { questions: { id: number }[]; limit: number };
    expect(body.questions.map((q) => q.id)).toEqual(questionIds);
    expect(body.limit).toBe(500);
  });

  it('moves ticked questions to the new part and recounts both chapters', async () => {
    await actAs(adminUser);
    const created = await chaptersPost(
      post('http://localhost/api/admin/content/chapters', { moduleCode, subjectId, name: 'Spinal cord (Part 2)', afterChapterId: ch1 })
    );
    const { chapter } = (await created.json()) as { chapter: { id: string } };
    createdChapterIds.push(chapter.id);

    const toMove = questionIds.slice(2); // positions #3 and #4
    const res = await bulkPost(post('http://localhost/api/admin/content/questions/bulk', { action: 'retag', ids: toMove, chapterId: chapter.id }));
    expect(res.status).toBe(200);

    const { data } = await admin.from('chapters').select('id, question_count, published_count').in('id', [ch1, chapter.id]);
    const byId = Object.fromEntries((data as { id: string; question_count: number; published_count: number }[]).map((r) => [r.id, r]));
    expect(byId[ch1]).toMatchObject({ question_count: 2, published_count: 2 });
    expect(byId[chapter.id]).toMatchObject({ question_count: 2, published_count: 1 });
  });
});
