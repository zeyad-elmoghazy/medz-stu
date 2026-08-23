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
import { POST as importPost } from '@/app/api/admin/questions/import/route';
import {
  supabaseTestEnvAvailable,
  getServiceRoleClient,
  createTestUser,
  deleteTestUser,
  signInTestUser,
  uniqueSlug,
  type TestUser,
} from '../helpers/supabase-test-env';

const mockCreateRouteHandlerClient = createRouteHandlerClient as jest.MockedFunction<
  typeof createRouteHandlerClient
>;

const describeIfSupabase = supabaseTestEnvAvailable() ? describe : describe.skip;

/**
 * Runs the real POST /api/admin/questions/import handler twice with the
 * same payload and confirms the second run upserts (by external_id)
 * instead of duplicating: same row count, same ids, values updated.
 *
 * Fixtures (subject/module/chapter) are created fresh per test rather
 * than reusing seeded data, so this suite never depends on — or risks
 * corrupting — real content.
 */
describeIfSupabase('import route upsert idempotency', () => {
  const admin = getServiceRoleClient();
  let adminUser: TestUser;
  let subjectId: string;
  let subjectSlug: string;
  let moduleCode: string;
  let chapterId: string;

  beforeEach(async () => {
    adminUser = await createTestUser(admin, 'admin');

    subjectSlug = uniqueSlug('subject');
    const { data: subject, error: subjectErr } = await admin
      .from('subjects')
      .insert({ slug: subjectSlug, name: subjectSlug })
      .select('id, slug')
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
      .insert({
        module_code: moduleCode,
        subject_id: subjectId,
        slug: chapterSlug,
        name: chapterSlug,
      })
      .select('id')
      .single();
    if (chapterErr || !chapter) throw new Error(`chapter fixture failed: ${chapterErr?.message}`);
    chapterId = (chapter as { id: string }).id;
  });

  afterEach(async () => {
    await admin.from('questions').delete().eq('subject_id', subjectSlug);
    await admin.from('chapters').delete().eq('id', chapterId);
    await admin.from('modules').delete().eq('code', moduleCode);
    await admin.from('subjects').delete().eq('id', subjectId);
    await deleteTestUser(admin, adminUser.id);
  });

  function importRequest(externalIdPrefix: string, explanationSuffix: string): NextRequest {
    return new NextRequest('http://localhost/api/admin/questions/import', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        moduleCode,
        chapterId,
        data: {
          questions: [
            {
              question_id: `${externalIdPrefix}_Q001`,
              stem: 'What is the capital of the test fixture?',
              options: { a: 'Alpha', b: 'Beta', c: 'Gamma' },
              final_answer: 'a',
              explanation: `first question ${explanationSuffix}`,
              reference_page: 12,
            },
            {
              question_id: `${externalIdPrefix}_Q002`,
              stem: 'Which value is correct?',
              options: { a: 'One', b: 'Two' },
              final_answer: 'b',
              explanation: `second question ${explanationSuffix}`,
            },
          ],
        },
      }),
    });
  }

  test('second run upserts instead of duplicating', async () => {
    const client = await signInTestUser(adminUser.email, adminUser.password);
    const prefix = uniqueSlug('VIS').toUpperCase();

    mockCreateRouteHandlerClient.mockResolvedValueOnce(client as SupabaseClient<any>);
    const firstRes = await importPost(importRequest(prefix, 'v1'));
    expect(firstRes.status).toBe(201);
    const firstBody = await firstRes.json();
    expect(firstBody.imported).toBe(2);
    const firstIds = [...firstBody.questionIds].sort();

    mockCreateRouteHandlerClient.mockResolvedValueOnce(client as SupabaseClient<any>);
    const secondRes = await importPost(importRequest(prefix, 'v2'));
    expect(secondRes.status).toBe(201);
    const secondBody = await secondRes.json();
    expect(secondBody.imported).toBe(2);
    const secondIds = [...secondBody.questionIds].sort();

    // Same rows, not new ones.
    expect(secondIds).toEqual(firstIds);

    const { data: rows, error } = await admin
      .from('questions')
      .select('external_id, explanation')
      .eq('subject_id', subjectSlug)
      .order('external_id', { ascending: true });
    expect(error).toBeNull();
    expect(rows).toHaveLength(2);
    expect((rows as any[]).map((r) => r.external_id)).toEqual([`${prefix}_Q001`, `${prefix}_Q002`]);
    // Values were updated by the second run, not duplicated alongside the first.
    expect((rows as any[]).every((r) => r.explanation.endsWith('v2'))).toBe(true);
  });
});
