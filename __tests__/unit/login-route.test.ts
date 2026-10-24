// Drives the REAL POST /api/auth/login handler. Only the edges are
// stubbed: the cookie store, the Supabase auth call, and the Upstash
// limiters (replaced by an in-memory counter with the same
// `.limit(id)` contract), so we can assert the limiter wiring without
// a Redis instance.
import { NextRequest } from 'next/server';

jest.mock('next/headers', () => ({ cookies: jest.fn() }));

const mockSignIn = jest.fn();
jest.mock('@/lib/supabase-server', () => ({
  createRouteHandlerClient: jest.fn(async () => ({
    auth: { signInWithPassword: mockSignIn },
  })),
}));

jest.mock('@/lib/rate-limit', () => {
  const makeLimiter = (max: number) => {
    const seen = new Map<string, number>();
    return {
      max,
      seen,
      limit: jest.fn(async (id: string) => {
        const n = (seen.get(id) ?? 0) + 1;
        seen.set(id, n);
        return { success: n <= max, limit: max, remaining: Math.max(0, max - n), reset: Date.now() + 120_000 };
      }),
    };
  };
  return {
    loginIpLimiter: makeLimiter(5),
    loginEmailLimiter: makeLimiter(3),
  };
});

import { POST } from '@/app/api/auth/login/route';
import { loginEmailLimiter, loginIpLimiter } from '@/lib/rate-limit';

type FakeLimiter = { max: number; seen: Map<string, number>; limit: jest.Mock };
const emailLimiter = loginEmailLimiter as unknown as FakeLimiter;
const ipLimiter = loginIpLimiter as unknown as FakeLimiter;

function req(body: unknown, ip = '203.0.113.7', raw = false) {
  return new NextRequest('http://localhost/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: raw ? (body as string) : JSON.stringify(body),
  });
}

beforeEach(() => {
  mockSignIn.mockReset();
  emailLimiter.seen.clear();
  ipLimiter.seen.clear();
  emailLimiter.limit.mockClear();
  ipLimiter.limit.mockClear();
  mockSignIn.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
});

describe('POST /api/auth/login', () => {
  it('signs in with valid credentials', async () => {
    const res = await POST(req({ email: 'a@b.test', password: 'pw-123456' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(mockSignIn).toHaveBeenCalledWith({ email: 'a@b.test', password: 'pw-123456' });
  });

  it('returns the same generic 401 for any auth failure (no enumeration)', async () => {
    mockSignIn.mockResolvedValue({ data: { user: null }, error: { message: 'User not found' } });
    const res = await POST(req({ email: 'nobody@b.test', password: 'x' }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Invalid email or password.' });
  });

  it.each([
    ['not json', 'nope{', true],
    ['missing password', { email: 'a@b.test' }, false],
    ['empty email', { email: '', password: 'x' }, false],
    ['non-string password', { email: 'a@b.test', password: 12345 }, false],
    ['oversized password', { email: 'a@b.test', password: 'x'.repeat(5000) }, false],
    ['oversized email', { email: 'a'.repeat(300) + '@b.test', password: 'x' }, false],
  ])('rejects malformed input (%s) without calling the auth service', async (_n, body, raw) => {
    const res = await POST(req(body, '203.0.113.7', raw as boolean));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid email or password.' });
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it('rate-limits PER EMAIL: 4th attempt on one account is 429, other accounts unaffected', async () => {
    for (let i = 0; i < 3; i++) {
      expect((await POST(req({ email: 'victim@b.test', password: 'guess' + i }))).status).toBe(200);
    }
    mockSignIn.mockClear();
    const blocked = await POST(req({ email: 'victim@b.test', password: 'guess4' }));
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get('Retry-After'))).toBeGreaterThan(0);
    expect(mockSignIn).not.toHaveBeenCalled(); // blocked BEFORE hitting Supabase

    const other = await POST(req({ email: 'someone-else@b.test', password: 'pw' }));
    expect(other.status).toBe(200);
  });

  it('treats case / whitespace variants of an email as the same account', async () => {
    for (const e of ['Victim@B.test', ' victim@b.test', 'VICTIM@B.TEST']) {
      await POST(req({ email: e, password: 'x' }));
    }
    const blocked = await POST(req({ email: 'victim@b.test', password: 'x' }));
    expect(blocked.status).toBe(429);
  });

  it('never stores the raw email in the limiter key (hashed)', async () => {
    await POST(req({ email: 'private@student.test', password: 'x' }));
    const ids = emailLimiter.limit.mock.calls.map((c) => c[0] as string);
    expect(ids).toHaveLength(1);
    expect(ids[0]).toMatch(/^email:[0-9a-f]{64}$/);
    expect(ids[0]).not.toContain('private');
  });

  it('rate-limits PER IP, before the body is even read, and per-IP buckets are separate', async () => {
    for (let i = 0; i < 5; i++) {
      await POST(req({ email: `u${i}@b.test`, password: 'x' }, '198.51.100.9'));
    }
    mockSignIn.mockClear();
    emailLimiter.limit.mockClear();
    const blocked = await POST(req({ email: 'u9@b.test', password: 'x' }, '198.51.100.9'));
    expect(blocked.status).toBe(429);
    expect(mockSignIn).not.toHaveBeenCalled();
    expect(emailLimiter.limit).not.toHaveBeenCalled(); // short-circuited on IP

    const otherIp = await POST(req({ email: 'u10@b.test', password: 'x' }, '198.51.100.10'));
    expect(otherIp.status).toBe(200);
  });

  it('fails OPEN when the limiter backend (Redis) throws — an outage must not lock everyone out', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    ipLimiter.limit.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    emailLimiter.limit.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const res = await POST(req({ email: 'a@b.test', password: 'pw' }));
    expect(res.status).toBe(200);
    expect(mockSignIn).toHaveBeenCalled();
    spy.mockRestore();
  });
});
