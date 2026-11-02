// jest.mock() must be written before the imports it affects — see
// student-stats-chapter-context.test.ts for the same note.
jest.mock('@/lib/supabase-server', () => {
  const actual = jest.requireActual('@/lib/supabase-server');
  return {
    ...actual,
    createRouteHandlerClient: jest.fn(),
  };
});

import { NextRequest } from 'next/server';
import { createRouteHandlerClient } from '@/lib/supabase-server';
import { GET as bookmarksGet } from '@/app/api/student/bookmarks/route';
import { groupBookmarks, type GroupableBookmark } from '@/lib/bookmark-groups';
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

type ListedBookmark = GroupableBookmark & {
  id: string;
  questionId: number;
  question: string;
  chapterId: string | null;
};

/**
 * Bookmarks page grouping: GET /api/student/bookmarks (list mode) must say,
 * for each bookmark, WHICH chapter in WHICH subject in WHICH module it
 * belongs to — read from the database — so /student/bookmarks can group
 * Module › Subject. Real database; only the cookie-bound client factory is
 * mocked. Self-contained fixtures, cleaned up afterwards.
 */
describeIfSupabase('GET /api/student/bookmarks — module/subject grouping', () => {
  const admin = getServiceRoleClient();
  let student: TestUser;
  let other: TestUser;

  const subjectIds: string[] = [];
  const moduleCodes: string[] = [];
  const chapterIds: string[] = [];
  let questionIds: number[] = [];

  type Fx = {
    subjectId: string;
    subjectSlug: string;
    subjectName: string;
    moduleCode: string;
    moduleName: string;
    chapterId: string;
    chapterName: string;
    qids: number[];
  };

  async function makeFixture(
    label: string,
    subjectName: string,
    moduleName: string,
    chapterName: string
  ): Promise<Fx> {
    const subjectSlug = uniqueSlug(`${label}-subject`);
    const { data: subject, error: sErr } = await admin
      .from('subjects')
      .insert({ slug: subjectSlug, name: subjectName })
      .select('id')
      .single();
    if (sErr || !subject) throw new Error(`subject fixture failed: ${sErr?.message}`);
    const subjectId = (subject as { id: string }).id;
    subjectIds.push(subjectId);

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
        subject_id: subjectId,
        slug: uniqueSlug(`${label}-chapter`),
        name: chapterName,
      })
      .select('id')
      .single();
    if (cErr || !chapter) throw new Error(`chapter fixture failed: ${cErr?.message}`);
    const chapterId = (chapter as { id: string }).id;
    chapterIds.push(chapterId);

    const rows = Array.from({ length: 2 }, (_, i) => ({
      chapter_id: chapterId,
      subject_id: subjectSlug,
      subject_bundle_id: i + 1,
      question: `${label} question ${i + 1}`,
      choices: [
        { id: 'a', text: 'Correct' },
        { id: 'b', text: 'Wrong' },
      ],
      correct_answer: 'a',
      topic: `${label} topic ${i + 1}`,
      status: 'published',
    }));
    const { data: qs, error: qErr } = await admin.from('questions').insert(rows).select('id');
    if (qErr || !qs) throw new Error(`questions fixture failed: ${qErr?.message}`);
    const qids = (qs as { id: number }[]).map((q) => q.id);
    questionIds = questionIds.concat(qids);

    return { subjectId, subjectSlug, subjectName, moduleCode, moduleName, chapterId, chapterName, qids };
  }

  async function bookmark(userId: string, questionId: number, subjectSlug: string, createdAt?: string) {
    const { error } = await admin.from('bookmarks').insert({
      student_id: userId,
      question_id: questionId,
      subject_id: subjectSlug,
      ...(createdAt ? { created_at: createdAt } : {}),
    });
    if (error) throw new Error(`bookmark fixture failed: ${error.message}`);
  }

  async function listBookmarks(as: TestUser): Promise<ListedBookmark[]> {
    const client = await signInTestUser(as.email, as.password);
    mockCreateRouteHandlerClient.mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createRouteHandlerClient>>
    );
    const res = await bookmarksGet(new NextRequest('http://localhost/api/student/bookmarks'));
    expect(res.status).toBe(200);
    return ((await res.json()) as { bookmarks: ListedBookmark[] }).bookmarks;
  }

  let anatomy: Fx; // real module name
  let physiology: Fx; // placeholder-named module, other subject

  beforeEach(async () => {
    student = await createTestUser(admin, 'student');
    other = await createTestUser(admin, 'student');
    anatomy = await makeFixture('anat', 'Anatomy (test)', 'Nervous System (test)', 'Brain Stem (test)');
    physiology = await makeFixture('phys', 'Physiology (test)', 'Module 977', 'Heart (test)');
  });

  afterEach(async () => {
    await deleteTestUser(admin, student.id); // cascades bookmarks
    await deleteTestUser(admin, other.id);
    await admin.from('questions').delete().in('id', questionIds);
    await admin.from('chapters').delete().in('id', chapterIds);
    await admin.from('modules').delete().in('code', moduleCodes);
    await admin.from('subjects').delete().in('id', subjectIds);
    questionIds = [];
    chapterIds.length = 0;
    moduleCodes.length = 0;
    subjectIds.length = 0;
  });

  test('each bookmark carries chapter, module (code + name) and subject (id + name)', async () => {
    await bookmark(student.id, anatomy.qids[0], anatomy.subjectSlug);
    await bookmark(student.id, physiology.qids[0], physiology.subjectSlug);

    const list = await listBookmarks(student);
    expect(list).toHaveLength(2);

    const anat = list.find((b) => b.questionId === anatomy.qids[0]);
    expect(anat).toMatchObject({
      chapterId: anatomy.chapterId,
      chapterName: 'Brain Stem (test)',
      moduleCode: anatomy.moduleCode,
      moduleName: 'Nervous System (test)',
      subjectId: anatomy.subjectId,
      subjectName: 'Anatomy (test)',
    });

    const phys = list.find((b) => b.questionId === physiology.qids[0]);
    expect(phys).toMatchObject({
      moduleCode: physiology.moduleCode,
      moduleName: 'Module 977', // raw; the UI collapses placeholders via moduleLabel
      subjectId: physiology.subjectId,
      subjectName: 'Physiology (test)',
    });
  });

  test('a question that is gone, unpublished, or chapter-less comes back with null context', async () => {
    // 1. bookmarks.question_id has no FK, so a deleted question leaves a dangling row.
    await bookmark(student.id, 2_000_000_000, anatomy.subjectSlug);
    // 2. an unpublished question is hidden from students by RLS.
    const { error: uErr } = await admin
      .from('questions')
      .update({ status: 'under_review' })
      .eq('id', anatomy.qids[1]);
    if (uErr) throw new Error(`unpublish fixture failed: ${uErr.message}`);
    await bookmark(student.id, anatomy.qids[1], anatomy.subjectSlug);
    // 3. a published question not attached to any chapter.
    const { data: loose, error: lErr } = await admin
      .from('questions')
      .insert({
        chapter_id: null,
        subject_id: anatomy.subjectSlug,
        subject_bundle_id: 99,
        question: 'loose question',
        choices: [{ id: 'a', text: 'x' }],
        correct_answer: 'a',
        topic: 'loose',
        status: 'published',
      })
      .select('id')
      .single();
    if (lErr || !loose) throw new Error(`loose question fixture failed: ${lErr?.message}`);
    const looseId = (loose as { id: number }).id;
    questionIds.push(looseId);
    await bookmark(student.id, looseId, anatomy.subjectSlug);

    const list = await listBookmarks(student);
    expect(list).toHaveLength(3);
    for (const b of list) {
      expect(b).toMatchObject({
        chapterId: null,
        chapterName: null,
        moduleCode: null,
        moduleName: null,
        subjectId: null,
        subjectName: null,
      });
    }
    expect(list.find((b) => b.questionId === 2_000_000_000)?.question).toBe(
      '(question no longer available)'
    );
  });

  test("never returns another student's bookmarks", async () => {
    await bookmark(student.id, anatomy.qids[0], anatomy.subjectSlug);
    await bookmark(other.id, physiology.qids[0], physiology.subjectSlug);

    const list = await listBookmarks(student);
    expect(list.map((b) => b.questionId)).toEqual([anatomy.qids[0]]);
  });

  test('the response feeds straight into groupBookmarks (Module › Subject, orphans last)', async () => {
    await bookmark(student.id, physiology.qids[0], physiology.subjectSlug, '2026-10-01T00:00:00Z');
    await bookmark(student.id, anatomy.qids[0], anatomy.subjectSlug, '2026-10-02T00:00:00Z');
    await bookmark(student.id, anatomy.qids[1], anatomy.subjectSlug, '2026-10-03T00:00:00Z');
    await bookmark(student.id, 2_000_000_001, anatomy.subjectSlug, '2026-10-04T00:00:00Z');

    const groups = groupBookmarks(await listBookmarks(student));
    expect(groups).toHaveLength(3);

    const anatGroup = groups.find((g) => g.label.includes('Nervous System (test)'));
    expect(anatGroup?.count).toBe(2);
    expect(anatGroup?.subjects.map((s) => s.subjectName)).toEqual(['Anatomy (test)']);
    // newest first within the chapter
    expect(anatGroup?.subjects[0].items.map((i) => i.questionId)).toEqual([
      anatomy.qids[1],
      anatomy.qids[0],
    ]);

    // Placeholder module name collapses to just the code.
    const physGroup = groups.find((g) => g.label === `Module ${physiology.moduleCode}`);
    expect(physGroup?.count).toBe(1);
    expect(physGroup?.subjects.map((s) => s.subjectName)).toEqual(['Physiology (test)']);

    // The dangling bookmark is kept, last, under "Other".
    expect(groups[groups.length - 1]).toMatchObject({ label: 'Other', count: 1 });
  });
});
