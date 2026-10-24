// Pure-logic checks for the 2026-10 hardening pass: cross-site write
// guard, demo-mode kill switch in production, DB error redaction.
import { isCrossSiteWrite } from '@/lib/csrf';
import { isDemoMode } from '@/lib/demo-profile';
import { publicDbError } from '@/lib/api-error';

const h = (init: Record<string, string>) => new Headers(init);

describe('isCrossSiteWrite', () => {
  it('never flags reads', () => {
    expect(isCrossSiteWrite('GET', h({ 'sec-fetch-site': 'cross-site' }))).toBe(false);
    expect(isCrossSiteWrite('HEAD', h({ origin: 'https://evil.example' }))).toBe(false);
  });

  it('blocks cross-site and same-site (sibling subdomain) writes', () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      expect(isCrossSiteWrite(method, h({ 'sec-fetch-site': 'cross-site' }))).toBe(true);
      expect(isCrossSiteWrite(method, h({ 'sec-fetch-site': 'same-site' }))).toBe(true);
    }
  });

  it('allows same-origin and user-initiated writes', () => {
    expect(isCrossSiteWrite('POST', h({ 'sec-fetch-site': 'same-origin' }))).toBe(false);
    expect(isCrossSiteWrite('POST', h({ 'sec-fetch-site': 'none' }))).toBe(false);
  });

  it('falls back to Origin vs Host when Sec-Fetch-Site is absent', () => {
    expect(
      isCrossSiteWrite('POST', h({ origin: 'https://www.medizee.app', host: 'www.medizee.app' }))
    ).toBe(false);
    expect(
      isCrossSiteWrite('POST', h({ origin: 'https://evil.example', host: 'www.medizee.app' }))
    ).toBe(true);
    // Behind a proxy the public host arrives in x-forwarded-host.
    expect(
      isCrossSiteWrite(
        'POST',
        h({ origin: 'https://www.medizee.app', host: 'internal:3000', 'x-forwarded-host': 'www.medizee.app' })
      )
    ).toBe(false);
  });

  it('rejects a malformed Origin on a write, passes header-less non-browser clients', () => {
    expect(isCrossSiteWrite('POST', h({ origin: 'not a url', host: 'x' }))).toBe(true);
    expect(isCrossSiteWrite('POST', h({}))).toBe(false); // curl / server-to-server
  });
});

describe('isDemoMode', () => {
  const env = process.env as Record<string, string | undefined>;
  const saved = { node: env.NODE_ENV, demo: env.NEXT_PUBLIC_DEMO };
  afterEach(() => {
    env.NODE_ENV = saved.node;
    env.NEXT_PUBLIC_DEMO = saved.demo;
  });

  it('is on for NEXT_PUBLIC_DEMO=1 outside production', () => {
    env.NODE_ENV = 'development';
    env.NEXT_PUBLIC_DEMO = '1';
    expect(isDemoMode()).toBe(true);
  });

  it('can NEVER be switched on in a production build', () => {
    env.NODE_ENV = 'production';
    env.NEXT_PUBLIC_DEMO = '1';
    expect(isDemoMode()).toBe(false);
  });

  it('is off unless explicitly "1"', () => {
    env.NODE_ENV = 'development';
    for (const v of [undefined, '0', 'true', '']) {
      env.NEXT_PUBLIC_DEMO = v;
      expect(isDemoMode()).toBe(false);
    }
  });
});

describe('publicDbError', () => {
  it('returns a generic message and never the raw database text', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const msg = publicDbError({
      code: '23505',
      message: 'duplicate key value violates unique constraint "profiles_username_key"',
    });
    expect(msg).toBe('Internal server error');
    expect(msg).not.toMatch(/profiles|constraint|duplicate/);
    // ...but the detail is still logged server-side for debugging.
    expect(spy).toHaveBeenCalledWith('[db-error]', '23505', expect.stringContaining('profiles_username_key'));
    spy.mockRestore();
  });

  it('tolerates null / undefined errors', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(publicDbError(null)).toBe('Internal server error');
    expect(publicDbError(undefined)).toBe('Internal server error');
    spy.mockRestore();
  });
});
