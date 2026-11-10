// The featured modules are configuration; the test points them at fixtures.
jest.mock('@/lib/try-config', () => {
  const actual = jest.requireActual('@/lib/try-config');
  return { ...actual, TRY_CONFIG: { questionCount: 10, modules: {} } };
});

import { NextRequest } from 'next/server';
import { TRY_CONFIG } from '@/lib/try-config';
import { POST as checkPost } from '@/app/api/try/check/route';
import {
  clearTryCache,
  loadTrySample,
  loadTrySamples,
  toPublicQuestions,
} from '@/lib/server/try-questions';
import {
  supabaseTestEnvAvailable,
  getServiceRoleClient,
  uniqueSlug,
} from '../helpers/supabase-test-env';

const describeIfSupabase = supabaseTestEnvAvailable() ? describe : describe.skip;

type Json = Record<string, any>;

/**
 * The public /try endpoint: no account, so it must only ever know the sampled
 * questions of each configured year, and the page must never receive the
 * answer key.
 */
describeIfSupabase('public /try (one module per year)', () => {
  const admin = getServiceRoleClient();
  const config = TRY_CONFIG as { questionCount: number; modules: Record<number, string | null> };
  let subjectId: string;
  let subjectSlug: string;
  let bigModule: string; // year 1: 25 published questions over 2 chapters + 1 unpublished
  let smallModule: string; // year 2: 4 published questions
  let chapterIds: string[] = [];
  let bigIds: number[] = []; // published ids of the big module, in id order
  let unpublishedId: number;
  let smallIds: number[] = [];

  beforeEach(async () => {
    clearTryCache();
    subjectSlug = uniqueSlug('subject');
    const { data: subject, error: subjectErr } = await admin
      .from('subjects')
      .insert({ slug: subjectSlug, name: subjectSlug })
      .select('id')
      .single();
    if (subjectErr || !subject) throw new Error(`subject fixture failed: ${subjectErr?.message}`);
    subjectId = (subject as { id: string }).id;

    async function makeModule(year: string, name: string): Promise<string> {
      const code = uniqueSlug('mod');
      const { error } = await admin
        .from('modules')
        .insert({ code, subject_id: subjectSlug, name, year_num: year, is_active: true });
      if (error) throw new Error(`module fixture failed: ${error.message}`);
      return code;
    }
    async function makeChapter(moduleCode: string): Promise<string> {
      const slug = uniqueSlug('chapter');
      const { data, error } = await admin
        .from('chapters')
        .insert({ module_code: moduleCode, subject_id: subjectId, slug, name: slug })
        .select('id')
        .single();
      if (error || !data) throw new Error(`chapter fixture failed: ${error?.message}`);
      const id = (data as { id: string }).id;
      chapterIds.push(id);
      return id;
    }
    const row = (chapter: string, n: number, status = 'published') => ({
      chapter_id: chapter,
      subject_id: subjectSlug,
      subject_bundle_id: 960000 + n,
      question: `try Q${n}`,
      choices: [
        { id: 'a', text: 'Right' },
        { id: 'b', text: 'Wrong' },
      ],
      correct_answer: 'a',
      explanation: `Because of ${n}.`,
      status,
    });
    async function insertQuestions(rows: ReturnType<typeof row>[]): Promise<number[]> {
      const { data, error } = await admin.from('questions').insert(rows).select('id').order('id');
      if (error || !data) throw new Error(`questions fixture failed: ${error?.message}`);
      return (data as { id: number }[]).map((q) => q.id);
    }

    bigModule = await makeModule('1', 'Big Module');
    smallModule = await makeModule('2', 'Small Module');
    const c1 = await makeChapter(bigModule);
    const c2 = await makeChapter(bigModule);
    const c3 = await makeChapter(smallModule);

    bigIds = await insertQuestions([
      ...Array.from({ length: 12 }, (_, i) => row(c1, i)),
      ...Array.from({ length: 13 }, (_, i) => row(c2, 100 + i)),
    ]);
    [unpublishedId] = await insertQuestions([row(c1, 200, 'under_review')]);
    smallIds = await insertQuestions(Array.from({ length: 4 }, (_, i) => row(c3, 300 + i)));

    config.modules = { 1: bigModule, 2: smallModule };
  });

  afterEach(async () => {
    config.modules = {};
    clearTryCache();
    await admin.from('questions').delete().in('id', [...bigIds, unpublishedId, ...smallIds]);
    await admin.from('chapters').delete().in('id', chapterIds);
    chapterIds = [];
    await admin.from('modules').delete().in('code', [bigModule, smallModule]);
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

  test('samples 10 published questions spread across the whole module', async () => {
    const sample = await loadTrySample(1);
    expect(sample?.moduleName).toBe('Big Module');
    const ids = sample?.rows.map((r) => r.id) ?? [];
    expect(ids).toHaveLength(10);
    expect(new Set(ids).size).toBe(10);
    expect(ids).not.toContain(unpublishedId);
    // Spread: from both chapters (the first 12 ids are chapter 1, the rest chapter 2).
    expect(ids.some((id) => bigIds.indexOf(id) < 12)).toBe(true);
    expect(ids.some((id) => bigIds.indexOf(id) >= 12)).toBe(true);
    expect(ids[0]).toBe(bigIds[1]); // evenly spaced: floor(0.5 * 25 / 10)
  });

  test('a module with fewer questions than the sample size shows all of them', async () => {
    const sample = await loadTrySample(2);
    expect(sample?.rows.map((r) => r.id)).toEqual(smallIds);
  });

  test('lists the configured years in order and skips the ones that are not offered', async () => {
    expect((await loadTrySamples()).map((s) => s.year)).toEqual([1, 2]);
    expect(await loadTrySample(3)).toBeNull();
    config.modules = {};
    clearTryCache();
    expect(await loadTrySamples()).toEqual([]);
  });

  test('the public payload has no answers', async () => {
    const sample = await loadTrySample(1);
    const pub = toPublicQuestions(sample?.rows ?? []);
    for (const q of pub) expect(Object.keys(q).sort()).toEqual(['choices', 'id', 'question']);
    expect(JSON.stringify(pub)).not.toMatch(/correct|explanation|Because/i);
  });

  test('checks an answer and returns the verdict with the explanation', async () => {
    const sample = await loadTrySample(2);
    const q = sample!.rows[0];
    const right: Json = await (await check({ year: 2, questionId: q.id, choice: 'a' })).json();
    expect(right).toEqual({ isCorrect: true, correctAnswer: 'a', explanation: q.explanation });

    const wrong: Json = await (await check({ year: 2, questionId: q.id, choice: 'b' })).json();
    expect(wrong).toMatchObject({ isCorrect: false, correctAnswer: 'a' });
  });

  test('knows nothing beyond each year’s sample', async () => {
    const sample = await loadTrySample(1);
    const sampled = new Set(sample!.rows.map((r) => r.id));
    const notSampled = bigIds.find((id) => !sampled.has(id))!;
    const inYearOne = sample!.rows[0].id;

    expect((await check({ year: 1, questionId: notSampled, choice: 'a' })).status).toBe(404); // same module, not sampled
    expect((await check({ year: 2, questionId: inYearOne, choice: 'a' })).status).toBe(404); // another year's sample
    expect((await check({ year: 1, questionId: unpublishedId, choice: 'a' })).status).toBe(404);
    expect((await check({ year: 3, questionId: inYearOne, choice: 'a' })).status).toBe(404); // year not offered
    expect((await check({ year: 99, questionId: inYearOne, choice: 'a' })).status).toBe(404);
    expect((await check({ year: 1, questionId: 999_999_999, choice: 'a' })).status).toBe(404);
  });

  test('rejects an invalid choice and a malformed body', async () => {
    const q = (await loadTrySample(2))!.rows[0];
    expect((await check({ year: 2, questionId: q.id, choice: 'zzz' })).status).toBe(400);
    expect((await check({ year: 2, questionId: 'x', choice: 'a' })).status).toBe(400);
    expect((await check({ questionId: q.id, choice: 'a' })).status).toBe(400); // no year
    expect((await check({})).status).toBe(400);
  });

  test('answers 404 for everything while no year is configured', async () => {
    const q = (await loadTrySample(2))!.rows[0];
    config.modules = {};
    clearTryCache();
    expect((await check({ year: 2, questionId: q.id, choice: 'a' })).status).toBe(404);
  });
});
