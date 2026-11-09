import { readApiError } from '@/lib/catalogue-api';

const res = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status });

describe('readApiError', () => {
  it('never shows a raw HTTP status', async () => {
    for (const status of [400, 404, 500, 502, 503]) {
      expect(await readApiError(res(status))).not.toMatch(/HTTP|\b[45]\d\d\b/);
    }
  });

  it('keeps our own readable 4xx messages', async () => {
    expect(await readApiError(res(404, { error: 'Chapter not found' }))).toBe('Chapter not found');
  });

  it('hides a 5xx body, which is not written for students', async () => {
    const msg = await readApiError(res(500, { error: 'relation "chapters" does not exist' }));
    expect(msg).toMatch(/something went wrong/i);
    expect(msg).not.toMatch(/relation/);
  });

  it('has plain wording for auth and throttling', async () => {
    expect(await readApiError(res(401))).toMatch(/log in again/i);
    expect(await readApiError(res(429, { error: 'Too many requests' }))).toMatch(/wait a moment/i);
  });

  it('copes with a 4xx that has no JSON body', async () => {
    expect(await readApiError(res(400))).toMatch(/try again/i);
  });
});
