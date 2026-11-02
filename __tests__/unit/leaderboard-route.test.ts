// Drives the REAL GET /api/student/leaderboard handler. The RPCs are stubbed
// to return rows that STILL carry a real name and email (as an old database
// would) to prove the route's whitelist keeps them out of the response.
jest.mock('next/headers', () => ({ cookies: jest.fn() }));

const mockRole = { data: { role: 'student' } as { role: string } | null };
jest.mock('@/lib/supabase-server', () => ({
  createRouteHandlerClient: jest.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'me-id' } } }) },
    from: () => ({ select: () => ({ eq: () => ({ single: async () => mockRole }) }) }),
  })),
}));

const rpc = jest.fn();
jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn(() => ({ rpc })) }));

const mockWithCache = jest.fn(async (_key: string, _ttl: number, fn: () => Promise<unknown>) => fn());
jest.mock('@/lib/cache', () => ({
  withCache: (...args: [string, number, () => Promise<unknown>]) => mockWithCache(...args),
}));

import { GET } from '@/app/api/student/leaderboard/route';

const dirty = (id: string, username: string, rank: number) => ({
  rank,
  id,
  username,
  full_name: `Real Name ${username}`,
  email: `${username}@example.test`,
  total_xp: 1000 - rank,
  total_correct_answers: 10,
  total_questions_answered: 20,
  last_active_at: null,
  highest_badge: null,
});

beforeEach(() => {
  rpc.mockReset();
  mockWithCache.mockClear();
  mockRole.data = { role: 'student' };
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test-key';
});

describe('GET /api/student/leaderboard', () => {
  test('returns usernames only — no real name or email — for the top 10', async () => {
    rpc.mockImplementation(async (name: string) =>
      name === 'get_leaderboard_top'
        ? { data: [dirty('a', 'lb_one', 1), dirty('me-id', 'lb_me', 2)], error: null }
        : { data: null, error: null }
    );
    const res = await GET();
    const text = JSON.stringify(await res.json());
    expect(res.status).toBe(200);
    expect(text).toContain('lb_one');
    expect(text).not.toMatch(/Real Name|full_name|email|example\.test/);
  });

  test("the caller's own row, fetched when outside the top 10, is also stripped", async () => {
    rpc.mockImplementation(async (name: string) =>
      name === 'get_leaderboard_top'
        ? { data: [dirty('a', 'lb_one', 1)], error: null }
        : { data: [dirty('me-id', 'lb_me', 42)], error: null }
    );
    const body = await (await GET()).json();
    expect(body.me).toMatchObject({ id: 'me-id', username: 'lb_me', rank: 42 });
    expect(JSON.stringify(body)).not.toMatch(/Real Name|full_name|email|example\.test/);
  });

  test('a student without a ranking gets me: null', async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    const body = await (await GET()).json();
    expect(body).toEqual({ top10: [], me: null });
  });

  test('uses the v2 cache key, so entries cached before usernames are never served', async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    await GET();
    expect(mockWithCache.mock.calls[0][0]).toBe('leaderboard:global:v2');
  });

  test('admins are refused', async () => {
    mockRole.data = { role: 'admin' };
    expect((await GET()).status).toBe(403);
  });
});
