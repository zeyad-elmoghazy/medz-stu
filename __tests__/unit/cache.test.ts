import { CACHE_KEYS, TTL } from '@/lib/redis';

/**
 * lib/cache.ts's withCache/invalidateCache wrap the `redis` client
 * exported by lib/redis.ts, which is `null` whenever
 * UPSTASH_REDIS_URL/UPSTASH_REDIS_TOKEN aren't configured — true of
 * both local dev and the actual Vercel production deployment right
 * now (verified: no UPSTASH_* env var exists in either place), so
 * every real request today takes the "bypass entirely" branch. This
 * suite can't exercise a live Upstash connection without real
 * credentials, so it verifies the wrapper's *logic* instead, via a
 * mocked `redis` client — including that "no credentials configured"
 * branch, which is the one actually exercised in production today.
 *
 * `lib/cache.ts` imports `redis` at module load time, so each
 * scenario needs its own fresh module instance (jest.resetModules +
 * jest.doMock + a dynamic import) to inject a different mock.
 */
describe('withCache / invalidateCache', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('@/lib/redis');
  });

  test('bypasses the cache entirely when redis is unavailable (today\'s real-world state)', async () => {
    jest.doMock('@/lib/redis', () => ({ redis: null }));
    const { withCache, invalidateCache } = await import('@/lib/cache');

    const fetcher = jest.fn().mockResolvedValue('fresh-value');
    const result = await withCache(CACHE_KEYS.leaderboardGlobal(), TTL.LEADERBOARD, fetcher);

    expect(result).toBe('fresh-value');
    expect(fetcher).toHaveBeenCalledTimes(1);
    await expect(invalidateCache(CACHE_KEYS.leaderboardGlobal())).resolves.toBeUndefined();
  });

  test('returns the cached value on a hit, without calling the fetcher', async () => {
    const mockRedis = { get: jest.fn().mockResolvedValue('cached-value'), setex: jest.fn(), del: jest.fn() };
    jest.doMock('@/lib/redis', () => ({ redis: mockRedis }));
    const { withCache } = await import('@/lib/cache');

    const fetcher = jest.fn().mockResolvedValue('should-not-be-called');
    const result = await withCache(CACHE_KEYS.leaderboardGlobal(), TTL.LEADERBOARD, fetcher);

    expect(result).toBe('cached-value');
    expect(fetcher).not.toHaveBeenCalled();
    expect(mockRedis.get).toHaveBeenCalledWith(CACHE_KEYS.leaderboardGlobal());
  });

  test('on a miss, calls the fetcher and writes the result to cache with the given TTL', async () => {
    const mockRedis = { get: jest.fn().mockResolvedValue(null), setex: jest.fn().mockResolvedValue('OK'), del: jest.fn() };
    jest.doMock('@/lib/redis', () => ({ redis: mockRedis }));
    const { withCache } = await import('@/lib/cache');

    const payload = { top10: [{ id: 'abc', total_xp: 10 }] };
    const fetcher = jest.fn().mockResolvedValue(payload);
    const result = await withCache(CACHE_KEYS.leaderboardGlobal(), TTL.LEADERBOARD, fetcher);

    expect(result).toEqual(payload);
    expect(fetcher).toHaveBeenCalledTimes(1);
    // The write is fire-and-forget (not awaited by withCache) — flush microtasks.
    await new Promise((resolve) => setImmediate(resolve));
    expect(mockRedis.setex).toHaveBeenCalledWith(
      CACHE_KEYS.leaderboardGlobal(),
      TTL.LEADERBOARD,
      JSON.stringify(payload)
    );
  });

  test('a Redis read failure falls back to the fetcher rather than throwing', async () => {
    const mockRedis = {
      get: jest.fn().mockRejectedValue(new Error('ECONNRESET')),
      setex: jest.fn().mockResolvedValue('OK'),
      del: jest.fn(),
    };
    jest.doMock('@/lib/redis', () => ({ redis: mockRedis }));
    const { withCache } = await import('@/lib/cache');

    const fetcher = jest.fn().mockResolvedValue('fresh-despite-error');
    const result = await withCache(CACHE_KEYS.leaderboardGlobal(), TTL.LEADERBOARD, fetcher);

    expect(result).toBe('fresh-despite-error');
  });

  test('invalidateCache deletes every key passed to it', async () => {
    const mockRedis = { get: jest.fn(), setex: jest.fn(), del: jest.fn().mockResolvedValue(1) };
    jest.doMock('@/lib/redis', () => ({ redis: mockRedis }));
    const { invalidateCache } = await import('@/lib/cache');

    await invalidateCache(CACHE_KEYS.leaderboardGlobal(), CACHE_KEYS.studentAnalytics('user-1'));

    expect(mockRedis.del).toHaveBeenCalledWith(
      CACHE_KEYS.leaderboardGlobal(),
      CACHE_KEYS.studentAnalytics('user-1')
    );
  });

  test('invalidateCache with zero keys never calls del', async () => {
    const mockRedis = { get: jest.fn(), setex: jest.fn(), del: jest.fn() };
    jest.doMock('@/lib/redis', () => ({ redis: mockRedis }));
    const { invalidateCache } = await import('@/lib/cache');

    await invalidateCache();

    expect(mockRedis.del).not.toHaveBeenCalled();
  });

  test('an invalidate failure is swallowed, not thrown', async () => {
    const mockRedis = { get: jest.fn(), setex: jest.fn(), del: jest.fn().mockRejectedValue(new Error('timeout')) };
    jest.doMock('@/lib/redis', () => ({ redis: mockRedis }));
    const { invalidateCache } = await import('@/lib/cache');

    await expect(invalidateCache(CACHE_KEYS.leaderboardGlobal())).resolves.toBeUndefined();
  });
});
