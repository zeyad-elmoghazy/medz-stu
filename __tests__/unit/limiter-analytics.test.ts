// Upstash's free plan allows 500K commands a month and the previous database
// ran out in ~26 days. With `analytics: true` every Ratelimit.limit() call
// costs a second command (a ZINCRBY on top of the check). apiLimiter (every
// API request) and progressLimiter (every per-question save) are by far the
// highest-volume limiters and are only circuit breakers, so they skip
// analytics. The abuse-facing limiters (answer, content, login...) keep it:
// their comments promise the Upstash dashboard shows who is hammering them.
//
// A tiny HTTP server stands in for the Upstash REST API and records which
// commands each limiter sends.
import http from 'node:http';
import type { AddressInfo } from 'node:net';

describe('limiter analytics cost', () => {
  const commands: string[] = [];
  let server: http.Server;
  const saved = { url: process.env.UPSTASH_REDIS_URL, token: process.env.UPSTASH_REDIS_TOKEN };
  let limiters: typeof import('@/lib/rate-limit');

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        const cmd = JSON.parse(body);
        // Single commands arrive as ["CMD", ...]; pipelines as [[...], ...].
        const list: string[][] = Array.isArray(cmd[0]) ? cmd : [cmd];
        for (const c of list) commands.push(String(c[0]).toLowerCase());
        res.setHeader('content-type', 'application/json');
        // The limit script returns [remaining, limit]; ZINCRBY returns a number.
        const reply = (c: string[]) => ({
          result: /^eval/i.test(String(c[0])) ? [5, 100] : 1,
        });
        res.end(JSON.stringify(Array.isArray(cmd[0]) ? list.map(reply) : reply(cmd)));
      });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    process.env.UPSTASH_REDIS_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    process.env.UPSTASH_REDIS_TOKEN = 'unused';
    jest.isolateModules(() => {
      limiters = require('@/lib/rate-limit');
    });
  });

  afterAll(async () => {
    await new Promise((r) => server.close(r));
    if (saved.url === undefined) delete process.env.UPSTASH_REDIS_URL;
    else process.env.UPSTASH_REDIS_URL = saved.url;
    if (saved.token === undefined) delete process.env.UPSTASH_REDIS_TOKEN;
    else process.env.UPSTASH_REDIS_TOKEN = saved.token;
  });

  /** Commands one limit() call sends, including the background analytics write. */
  async function commandsFor(limiter: NonNullable<typeof limiters.apiLimiter>) {
    commands.length = 0;
    const res = await limiter.limit('analytics-test');
    await res.pending;
    return [...commands];
  }

  it('the high-volume limiters send only the check itself', async () => {
    expect(await commandsFor(limiters.apiLimiter!)).toHaveLength(1);
    expect(await commandsFor(limiters.progressLimiter!)).toHaveLength(1);
  });

  it('the abuse-facing limiters still record analytics for the dashboard', async () => {
    for (const limiter of [limiters.answerLimiter!, limiters.contentLimiter!, limiters.loginIpLimiter!]) {
      const sent = await commandsFor(limiter);
      expect(sent).toHaveLength(2);
      expect(sent).toContain('zincrby');
    }
  });
});
