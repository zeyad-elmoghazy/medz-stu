// Drives the REAL GET /api/auth/username-available handler. Only the edges
// are stubbed: the Supabase client (a canned head-count result) and the
// Upstash limiter (an in-memory counter with the same `.limit(id)` contract).
import { NextRequest } from 'next/server';

const mockEq = jest.fn();
const mockFrom = jest.fn();
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    from: (...args: unknown[]) => {
      mockFrom(...args);
      return { select: () => ({ eq: (...a: unknown[]) => mockEq(...a) }) };
    },
  })),
}));

jest.mock('@/lib/rate-limit', () => {
  const seen = new Map<string, number>();
  return {
    usernameCheckLimiter: {
      seen,
      limit: jest.fn(async (id: string) => {
        const n = (seen.get(id) ?? 0) + 1;
        seen.set(id, n);
        return { success: n <= 3, limit: 3, remaining: Math.max(0, 3 - n), reset: Date.now() + 60_000 };
      }),
    },
  };
});

import { GET } from '@/app/api/auth/username-available/route';

function req(query: string, ip = '203.0.113.9') {
  return new NextRequest(`http://localhost/api/auth/username-available${query}`, {
    headers: { 'x-forwarded-for': ip },
  });
}

beforeEach(() => {
  mockEq.mockReset();
  mockFrom.mockReset();
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test-key';
});

describe('GET /api/auth/username-available', () => {
  test('400 when the name is missing or blank', async () => {
    expect((await GET(req('', '10.0.0.1'))).status).toBe(400);
    expect((await GET(req('?u=%20%20', '10.0.0.2'))).status).toBe(400);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  test('malformed names are answered without touching the database', async () => {
    const res = await GET(req('?u=ab', '10.0.0.3'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toMatchObject({ available: false, reason: 'invalid' });
    expect(mockFrom).not.toHaveBeenCalled();
  });

  test('reserved names are answered without touching the database', async () => {
    const body = await (await GET(req('?u=Admin', '10.0.0.4'))).json();
    expect(body).toMatchObject({ available: false, reason: 'reserved' });
    expect(mockFrom).not.toHaveBeenCalled();
  });

  test('a taken name is reported as taken', async () => {
    mockEq.mockResolvedValue({ count: 1, error: null });
    const body = await (await GET(req('?u=yusuf_k', '10.0.0.5'))).json();
    expect(body).toMatchObject({ available: false, reason: 'taken' });
  });

  test('a free name is available, and the lookup uses the lowercased name', async () => {
    mockEq.mockResolvedValue({ count: 0, error: null });
    const body = await (await GET(req('?u=%20Free_Name%20', '10.0.0.6'))).json();
    expect(body).toEqual({ available: true });
    expect(mockFrom).toHaveBeenCalledWith('profiles');
    expect(mockEq).toHaveBeenCalledWith('username', 'free_name');
  });

  test('the response carries only availability, reason and message', async () => {
    mockEq.mockResolvedValue({ count: 1, error: null });
    const body = await (await GET(req('?u=yusuf_k', '10.0.0.7'))).json();
    expect(Object.keys(body).sort()).toEqual(['available', 'message', 'reason']);
  });

  test('a database error is a generic 500 that leaks no internals', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockEq.mockResolvedValue({
      count: null,
      error: { code: '42P01', message: 'relation "profiles" does not exist' },
    });
    const res = await GET(req('?u=yusuf_k', '10.0.0.8'));
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toMatch(/profiles|42P01|relation/);
    spy.mockRestore();
  });

  test('is rate limited per client IP', async () => {
    mockEq.mockResolvedValue({ count: 0, error: null });
    const ip = '10.0.0.99';
    for (let i = 0; i < 3; i++) expect((await GET(req('?u=abc', ip))).status).toBe(200);
    const blocked = await GET(req('?u=abc', ip));
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('Retry-After')).not.toBeNull();
    // A different IP is unaffected.
    expect((await GET(req('?u=abc', '10.0.0.100'))).status).toBe(200);
  });
});
