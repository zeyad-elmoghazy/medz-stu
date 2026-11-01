// The custom-exam DB helpers' error text is forwarded to the browser by
// the routes, so it must be the generic message, never PostgREST text.
jest.mock('@/lib/supabase-server', () => ({ createRouteHandlerClient: jest.fn() }));
jest.mock('@/lib/apply-rate-limit', () => ({ applyRateLimit: jest.fn() }));

import {
  fetchPublishedPool,
  fetchPublishedQuestionsByIds,
  loadOwnedExam,
} from '@/lib/server/custom-exam-db';

const RAW = 'relation "public.custom_exam_progress" does not exist (42P01)';

// A thenable query chain that resolves to a PostgREST-style error.
function failingService() {
  const result = Promise.resolve({ data: null, error: { message: RAW, code: '42P01' } });
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'in', 'order', 'range']) chain[m] = () => chain;
  chain.maybeSingle = () => result;
  chain.then = (ok: (v: unknown) => unknown, bad: (e: unknown) => unknown) => result.then(ok, bad);
  return { from: () => chain } as never;
}

describe('custom-exam DB helpers hide raw database errors', () => {
  let spy: jest.SpyInstance;
  beforeEach(() => {
    spy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => spy.mockRestore());

  test('loadOwnedExam', async () => {
    const res = await loadOwnedExam(failingService(), 'student-1', 'exam-1');
    expect(res.exam).toBeNull();
    expect(res.error).toBe('Internal server error');
    expect(res.error).not.toContain('custom_exam_progress');
  });

  test('fetchPublishedPool', async () => {
    const res = await fetchPublishedPool(failingService(), ['c1']);
    expect(res.error).toBe('Internal server error');
  });

  test('fetchPublishedQuestionsByIds', async () => {
    const res = await fetchPublishedQuestionsByIds(failingService(), [1, 2], 'id');
    expect(res.error).toBe('Internal server error');
  });

  test('the real cause is still logged server-side', async () => {
    await loadOwnedExam(failingService(), 'student-1', 'exam-1');
    expect(spy).toHaveBeenCalledWith('[db-error]', '42P01', RAW);
  });
});
