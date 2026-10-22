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
import { GET as referenceImageGet } from '@/app/api/student/chapters/[chapterId]/reference-image/route';
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

// 1x1 transparent PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
);

/**
 * Reference images must be visible in a Custom Exam. An exam mixes
 * chapters, and the page image is resolved through each question's OWN
 * chapter (chapters.default_book_id, else modules.book_id), so a mixed
 * exam has to show the right book for each question — including a chapter
 * that overrides the module's book. Real database + real storage bucket.
 */
describeIfSupabase('custom exam — reference images', () => {
  const admin = getServiceRoleClient();
  let student: TestUser;
  let client: SupabaseClient;

  const subjectIds: string[] = [];
  let moduleCode: string;
  let chModule: string; // uses the MODULE's book
  let chOverride: string; // overrides with its OWN book (default_book_id)
  let bookModule: string;
  let bookOverride: string;
  const questionIds: number[] = [];
  const objectPaths: string[] = [];
  let tag: string;

  async function makeBook(title: string, pagePath: string): Promise<string> {
    const { data, error } = await admin
      .from('reference_books')
      .insert({ title, total_pages: 1 })
      .select('id')
      .single();
    if (error || !data) throw new Error(`book fixture failed: ${error?.message}`);
    const id = (data as { id: string }).id;
    const up = await admin.storage.from('notes-pages').upload(pagePath, PNG, {
      contentType: 'image/png',
      upsert: true,
    });
    if (up.error) throw new Error(`upload failed: ${up.error.message}`);
    objectPaths.push(pagePath);
    const { error: pErr } = await admin
      .from('reference_pages')
      .insert({ book_id: id, page_number: 1, image_url: pagePath });
    if (pErr) throw new Error(`page fixture failed: ${pErr.message}`);
    return id;
  }

  beforeAll(async () => {
    tag = uniqueSlug('ref');
    student = await createTestUser(admin, 'student');
    client = await signInTestUser(student.email, student.password);

    bookModule = await makeBook(`Module book ${tag}`, `e2e-ref/${tag}/module.png`);
    bookOverride = await makeBook(`Override book ${tag}`, `e2e-ref/${tag}/override.png`);

    const subj = async (label: string) => {
      const slug = uniqueSlug(label);
      const { data, error } = await admin
        .from('subjects')
        .insert({ slug, name: `Subject ${label}` })
        .select('id')
        .single();
      if (error || !data) throw new Error(`subject fixture failed: ${error?.message}`);
      subjectIds.push((data as { id: string }).id);
      return { id: (data as { id: string }).id, slug };
    };
    const a = await subj('A');
    const b = await subj('B');

    moduleCode = uniqueSlug('module');
    const { error: mErr } = await admin
      .from('modules')
      .insert({ code: moduleCode, subject_id: a.slug, name: `Module ${moduleCode}`, book_id: bookModule });
    if (mErr) throw new Error(`module fixture failed: ${mErr.message}`);
    await admin.from('module_subjects').insert([
      { module_code: moduleCode, subject_id: a.id },
      { module_code: moduleCode, subject_id: b.id },
    ]);

    const chapter = async (subject: { id: string }, name: string, defaultBook: string | null) => {
      const { data, error } = await admin
        .from('chapters')
        .insert({
          module_code: moduleCode,
          subject_id: subject.id,
          slug: uniqueSlug(name),
          name,
          default_book_id: defaultBook,
        })
        .select('id')
        .single();
      if (error || !data) throw new Error(`chapter fixture failed: ${error?.message}`);
      return (data as { id: string }).id;
    };
    chModule = await chapter(a, 'Uses module book', null);
    chOverride = await chapter(b, 'Overrides book', bookOverride);

    for (const [chapterId, slug] of [
      [chModule, a.slug],
      [chOverride, b.slug],
    ] as const) {
      const rows = [
        // cites page 1 -> must resolve an image
        { reference_page: 1 },
        { reference_page: 1 },
        // cites no page -> must have none
        { reference_page: null },
      ].map((r, i) => ({
        chapter_id: chapterId,
        subject_id: slug,
        subject_bundle_id: Math.floor(Math.random() * 1e9),
        question: `q${i}`,
        choices: [
          { id: 'a', text: 'A' },
          { id: 'b', text: 'B' },
        ],
        correct_answer: 'a',
        topic: `t${i}`,
        status: 'published',
        ...r,
      }));
      const { data, error } = await admin.from('questions').insert(rows).select('id');
      if (error || !data) throw new Error(`questions fixture failed: ${error?.message}`);
      questionIds.push(...(data as { id: number }[]).map((q) => q.id));
    }
  });

  afterAll(async () => {
    await admin.from('custom_exam_progress').delete().eq('student_id', student.id);
    if (questionIds.length) await admin.from('questions').delete().in('id', questionIds);
    await admin.from('chapters').delete().eq('module_code', moduleCode);
    await admin.from('module_subjects').delete().eq('module_code', moduleCode);
    await admin.from('modules').delete().eq('code', moduleCode);
    await admin.from('subjects').delete().in('id', subjectIds);
    await admin.from('reference_books').delete().in('id', [bookModule, bookOverride]); // cascades pages
    if (objectPaths.length) await admin.storage.from('notes-pages').remove(objectPaths);
    await deleteTestUser(admin, student.id);
  });

  async function startExam() {
    actAs(client);
    const res = await createPost(
      req('POST', '/api/student/custom-exam', { moduleCode, chapterIds: [chModule, chOverride], count: 6 })
    );
    expect(res.status).toBe(200);
    const { examId } = await res.json();
    actAs(client);
    const exam = await examGet(req('GET', `/api/student/custom-exam/${examId}`), {
      params: Promise.resolve({ examId }),
    });
    expect(exam.status).toBe(200);
    return exam.json() as Promise<{
      questions: { id: number; chapterId: string; referencePage: number | null }[];
    }>;
  }

  async function imageFor(chapterId: string, page: number) {
    actAs(client);
    const res = await referenceImageGet(
      req('GET', `/api/student/chapters/${chapterId}/reference-image?page=${page}`),
      { params: Promise.resolve({ chapterId }) }
    );
    expect(res.status).toBe(200);
    return ((await res.json()) as { url: string | null }).url;
  }

  test('every exam question carries the chapter and page its image is resolved from', async () => {
    const body = await startExam();
    expect(body.questions).toHaveLength(6);
    for (const q of body.questions) {
      expect([chModule, chOverride]).toContain(q.chapterId);
      expect([1, null]).toContain(q.referencePage);
    }
    expect(body.questions.filter((q) => q.referencePage === 1)).toHaveLength(4);
    expect(body.questions.filter((q) => q.referencePage === null)).toHaveLength(2);
  });

  test('a mixed exam shows the right book per question, incl. a chapter that overrides the module book', async () => {
    const body = await startExam();
    const cited = body.questions.filter((q) => q.referencePage !== null);
    expect(cited.some((q) => q.chapterId === chModule)).toBe(true);
    expect(cited.some((q) => q.chapterId === chOverride)).toBe(true);

    for (const q of cited) {
      const url = await imageFor(q.chapterId, q.referencePage as number);
      expect(url).toBeTruthy();
      expect(url).toContain(q.chapterId === chModule ? `${tag}/module.png` : `${tag}/override.png`);
      // The signed URL actually serves the image.
      const img = await fetch(url as string);
      expect(img.status).toBe(200);
      expect(img.headers.get('content-type')).toMatch(/image\/png/);
    }
  });

  test('a page the question does not cite never yields an image (no signing arbitrary pages)', async () => {
    expect(await imageFor(chModule, 2)).toBeNull();
    expect(await imageFor(chOverride, 99)).toBeNull();
  });
});
