// Regression: /api/health reported redis "error" (HTTP 503) on a perfectly
// healthy Upstash, because the client JSON-decodes replies — the "1" that
// was SET reads back as the number 1 — and the route compared it to '1'.
const mockSet = jest.fn();
const mockGet = jest.fn();

jest.mock('@/lib/redis', () => ({
  redis: { set: (...a: unknown[]) => mockSet(...a), get: (...a: unknown[]) => mockGet(...a) },
}));
// Skip the Supabase probe so only the Redis check is under test.
jest.mock('@/lib/supabase', () => ({ isDemoMode: () => true }));

import { GET } from '@/app/api/health/route';

beforeEach(() => {
  mockSet.mockReset().mockResolvedValue('OK');
  mockGet.mockReset();
});

describe('GET /api/health — redis check', () => {
  it('is ok when the client returns the number 1 (what Upstash really does)', async () => {
    mockGet.mockResolvedValue(1);
    const res = await GET();
    expect((await res.json()).checks.redis).toBe('ok');
    expect(res.status).toBe(200);
  });

  it('is ok when the client returns the string "1"', async () => {
    mockGet.mockResolvedValue('1');
    expect((await (await GET()).json()).checks.redis).toBe('ok');
  });

  it('is an error (503) when the value is wrong or missing', async () => {
    for (const bad of [null, 0, 'nope']) {
      mockGet.mockResolvedValue(bad);
      const res = await GET();
      expect((await res.json()).checks.redis).toBe('error');
      expect(res.status).toBe(503);
    }
  });

  it('is an error (503) when Redis throws', async () => {
    mockSet.mockRejectedValue(new Error('ECONNREFUSED'));
    const res = await GET();
    expect((await res.json()).checks.redis).toBe('error');
    expect(res.status).toBe(503);
  });
});
