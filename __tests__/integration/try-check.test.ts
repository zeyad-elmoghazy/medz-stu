// The featured chapter is configuration; the test points it at a fixture.
jest.mock('@/lib/try-config', () => ({ TRY_CONFIG: { chapterId: null, questionCount: 2 } }));

import { NextRequest } from 'next/server';
import { TRY_CONFIG } from '@/lib/try-config';
import { POST as checkPost } from '@/app/api/try/check/route';
import { loadTryRows, toPublicQuestions } from '@/lib/server/try-questions';
import {
  supabaseTestEnvAvailable,
  getServiceRoleClient,
  uniqueSlug,
} from '../helpers/supabase-test-env';

const describeIfSupabase = supabaseTestEnvAvailable() ? describe : describe.skip;

type Json = Record<string, any>;

/**
 * The public /try endpoint: no account, so it must only ever know the few
 * featured questions, and the page must never receive the answer key.
 */
describeIfSupabase('public /try', () => {
  const admin = getServiceRoleClient();
  const config = TRY_CONFIG as { chapterId: string | null; questionCount: number };
  let subjectId: string;
  let subjectSlug: string;
  let moduleCode: string;
  let chapterId: string;
  let otherChapterId: string;
  let qIds: number[] = []; // 3 questions in the featured chapter; only the first 2 are featured
  let outsideId: number; // a question in another chapter

  beforeEach(async () => {
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

    const row = (chapter: string, i: number, status = 'published') => ({
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
      status,
    });
    const { data: qs, error: qErr } = await admin
      .from('questions')
      .insert([row(chapterId, 0), row(chapterId, 1), row(chapterId, 2)])
      .select('id')
      .order('id');
    if (qErr || !qs) throw new Error(`questions fixture failed: ${qErr?.message}`);
    qIds = (qs as { id: number }[]).map((q) => q.id);

    const { data: oq, error: oqErr } = await admin
      .from('questions')
      .insert(row(otherChapterId, 10))
      .select('id')
      .single();
    if (oqErr || !oq) throw new Error(`other question fixture failed: ${oqErr?.message}`);
    outsideId = (oq as { id: number }).id;

    config.chapterId = chapterId;
  });

  afterEach(async () => {
    config.chapterId = null;
    await admin.from('questions').delete().in('id', [...qIds, outsideId]);
    await admin.from('chapters').delete().in('id', [chapterId, otherChapterId]);
    await admin.from('modules').delete().eq('code', moduleCode);
    await admin.from('subjects').delete().eq('id', subjectId);
  });

  const check = (body: unknown) =>
    checkPost(
      new NextRequest('http://localhost/api/try/check', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
    );

  test('features only the first questionCount published questions, without their answers', async () => {
    const rows = await loadTryRows();
    expect(rows?.map((r) => r.id)).toEqual([qIds[0], qIds[1]]);

    const pub = toPublicQuestions(rows ?? []);
    expect(pub).toHaveLength(2);
    for (const q of pub) expect(Object.keys(q).sort()).toEqual(['choices', 'id', 'question']);
    expect(JSON.stringify(pub)).not.toMatch(/correct|explanation|Because/i);
  });

  test('is empty when no chapter is configured', async () => {
    config.chapterId = null;
    expect(await loadTryRows()).toBeNull();
  });

  test('checks an answer and returns the verdict with the explanation', async () => {
    const right: Json = await (await check({ questionId: qIds[0], choice: 'a' })).json();
    expect(right).toEqual({ isCorrect: true, correctAnswer: 'a', explanation: 'Because of 1.' });

    const wrong: Json = await (await check({ questionId: qIds[1], choice: 'b' })).json();
    expect(wrong).toMatchObject({ isCorrect: false, correctAnswer: 'a' });
  });

  test('knows nothing beyond the featured questions', async () => {
    expect((await check({ questionId: qIds[2], choice: 'a' })).status).toBe(404); // same chapter, not featured
    expect((await check({ questionId: outsideId, choice: 'a' })).status).toBe(404); // another chapter
    expect((await check({ questionId: 999_999_999, choice: 'a' })).status).toBe(404);
  });

  test('rejects an invalid choice and a malformed body', async () => {
    expect((await check({ questionId: qIds[0], choice: 'zzz' })).status).toBe(400);
    expect((await check({ questionId: 'x', choice: 'a' })).status).toBe(400);
    expect((await check({})).status).toBe(400);
  });

  test('answers 404 for everything while /try is not configured', async () => {
    config.chapterId = null;
    expect((await check({ questionId: qIds[0], choice: 'a' })).status).toBe(404);
  });
});
