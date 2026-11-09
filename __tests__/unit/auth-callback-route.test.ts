const cookieJar = new Map<string, string>();
const deleted: string[] = [];
const exchange = jest.fn();
const update = jest.fn();
type Chain = {
  update: (payload: unknown) => Chain;
  eq: jest.Mock;
  is: jest.Mock;
  gte: jest.Mock;
};
const chain: Chain = {
  update: (payload: unknown) => {
    update(payload);
    return chain;
  },
  eq: jest.fn(() => chain),
  is: jest.fn(() => chain),
  gte: jest.fn(() => Promise.resolve({ error: null })),
};

jest.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (cookieJar.has(name) ? { value: cookieJar.get(name) } : undefined),
    delete: (name: string) => deleted.push(name),
  }),
}));
jest.mock('@/lib/supabase-server', () => ({
  createRouteHandlerClient: async () => ({ auth: { exchangeCodeForSession: exchange } }),
  untypedFrom: () => ({ from: () => chain }),
}));
jest.mock('@/lib/supabase-service', () => ({ serviceRoleClient: () => ({}) }));

import { NextRequest } from 'next/server';
import { GET } from '@/app/auth/callback/route';

const ORIGIN = 'http://127.0.0.1:3001';
const call = (qs: string) => GET(new NextRequest(`${ORIGIN}/auth/callback${qs}`));
const location = (res: Response) => new URL(res.headers.get('location')!).pathname + new URL(res.headers.get('location')!).search;

beforeEach(() => {
  cookieJar.clear();
  deleted.length = 0;
  jest.clearAllMocks();
  exchange.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
});

describe('GET /auth/callback', () => {
  it('sends a missing code or a provider error back to login', async () => {
    expect(location(await call(''))).toBe('/login?error=oauth_failed');
    expect(location(await call('?code=abc&error=access_denied'))).toBe('/login?error=oauth_failed');
    expect(exchange).not.toHaveBeenCalled();
  });

  it('sends a failed code exchange back to login', async () => {
    exchange.mockResolvedValue({ data: { user: null }, error: new Error('bad code') });
    expect(location(await call('?code=abc'))).toBe('/login?error=oauth_failed');
  });

  it('lands on the dashboard by default and honours only same-origin next', async () => {
    expect(location(await call('?code=abc'))).toBe('/student/dashboard');
    expect(location(await call('?code=abc&next=/student/catalogue/1'))).toBe('/student/catalogue/1');
    expect(location(await call('?code=abc&next=https://evil.example'))).toBe('/student/dashboard');
    expect(location(await call('?code=abc&next=//evil.example'))).toBe('/student/dashboard');
  });

  it('records the cookie attribution for a new signup, then clears the cookies', async () => {
    cookieJar.set('mz_signup_source', 'tiktok');
    cookieJar.set('mz_utm', JSON.stringify({ utm_source: 'tiktok', role: 'admin' }));
    await call('?code=abc');
    expect(update).toHaveBeenCalledWith({ signup_source: 'tiktok', signup_utm: { utm_source: 'tiktok' } });
    expect(chain.eq).toHaveBeenCalledWith('id', 'u1');
    expect(chain.is).toHaveBeenCalledWith('signup_source', null); // never overwrite an earlier answer
    expect(deleted).toEqual(expect.arrayContaining(['mz_signup_source', 'mz_utm']));
  });

  it('ignores an unknown source and skips the write when there is nothing to record', async () => {
    cookieJar.set('mz_signup_source', 'carrier-pigeon');
    await call('?code=abc');
    expect(update).not.toHaveBeenCalled();
  });

  it('never blocks the sign-in when the attribution write fails', async () => {
    cookieJar.set('mz_signup_source', 'friend');
    chain.gte.mockRejectedValueOnce(new Error('db down'));
    jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(location(await call('?code=abc'))).toBe('/student/dashboard');
  });
});
