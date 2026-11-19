// Regression: after the Upstash database was deleted, every API request took
// ~4.6s (health ~9s). The Redis client retries 5 times with exponential
// backoff, and @upstash/ratelimit waits up to 5s before failing open, so a
// dead Redis cost seconds per call. Both fail-open paths (proxy.ts,
// lib/apply-rate-limit.ts) are only useful if they fail open FAST.
//
// Port 1 on localhost refuses connections immediately: a stand-in for a
// Redis that no longer exists.

describe('a dead Redis must not slow requests down', () => {
  const saved = { url: process.env.UPSTASH_REDIS_URL, token: process.env.UPSTASH_REDIS_TOKEN };

  beforeAll(() => {
    process.env.UPSTASH_REDIS_URL = 'http://127.0.0.1:1';
    process.env.UPSTASH_REDIS_TOKEN = 'unused';
  });

  afterAll(() => {
    if (saved.url === undefined) delete process.env.UPSTASH_REDIS_URL;
    else process.env.UPSTASH_REDIS_URL = saved.url;
    if (saved.token === undefined) delete process.env.UPSTASH_REDIS_TOKEN;
    else process.env.UPSTASH_REDIS_TOKEN = saved.token;
  });

  it('rate-limit checks settle in well under a second (callers then fail open)', async () => {
    let apiLimiter: (typeof import('@/lib/rate-limit'))['apiLimiter'];
    jest.isolateModules(() => {
      apiLimiter = require('@/lib/rate-limit').apiLimiter;
    });
    expect(apiLimiter!).not.toBeNull();

    const started = Date.now();
    // Either outcome is fine (it throws, or resolves via the limiter's
    // timeout). What matters is how long the caller was kept waiting.
    await apiLimiter!.limit('fail-fast-test').catch(() => null);
    expect(Date.now() - started).toBeLessThan(1500);
  });
});
