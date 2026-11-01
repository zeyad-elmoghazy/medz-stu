import { safeRelativeNext } from '@/lib/safe-redirect';

const ORIGIN = 'https://www.example-app.test';

describe('safeRelativeNext', () => {
  test('keeps ordinary same-origin paths, queries and hashes', () => {
    expect(safeRelativeNext('/student/dashboard', ORIGIN)).toBe('/student/dashboard');
    expect(safeRelativeNext('/reset-password?x=1#top', ORIGIN)).toBe('/reset-password?x=1#top');
    expect(safeRelativeNext('/', ORIGIN)).toBe('/');
  });

  test('falls back to / when missing or not a path', () => {
    expect(safeRelativeNext(null, ORIGIN)).toBe('/');
    expect(safeRelativeNext(undefined, ORIGIN)).toBe('/');
    expect(safeRelativeNext('', ORIGIN)).toBe('/');
    expect(safeRelativeNext('student', ORIGIN)).toBe('/');
    expect(safeRelativeNext('https://evil.example/', ORIGIN)).toBe('/');
    expect(safeRelativeNext('@evil.example/', ORIGIN)).toBe('/');
  });

  test('rejects scheme-relative and backslash forms', () => {
    expect(safeRelativeNext('//evil.example', ORIGIN)).toBe('/');
    expect(safeRelativeNext('/\\evil.example', ORIGIN)).toBe('/');
    expect(safeRelativeNext('/\\/evil.example', ORIGIN)).toBe('/');
  });

  test('rejects a path that dot-segment removal turns into "//host"', () => {
    // new URL('/..//evil.example', origin).pathname === '//evil.example'
    expect(safeRelativeNext('/..//evil.example', ORIGIN)).toBe('/');
    expect(safeRelativeNext('/a/../..//evil.example', ORIGIN)).toBe('/');
  });

  test('rejects a path that dot-segment removal turns into "//host"', () => {
    // new URL('/..//evil.example', origin).pathname === '//evil.example'
    expect(safeRelativeNext('/..//evil.example', ORIGIN)).toBe('/');
    expect(safeRelativeNext('/a/../..//evil.example', ORIGIN)).toBe('/');
  });

  test('rejects control characters that the URL parser silently strips', () => {
    // These pass a first-two-characters check, then resolve off-site.
    for (const raw of ['/\t/evil.example', '/\n/evil.example', '/\r/evil.example', '/\t\\evil.example']) {
      expect(String(new URL(raw, ORIGIN))).toContain('evil.example'); // proves the old risk
      expect(safeRelativeNext(raw, ORIGIN)).toBe('/');
    }
    expect(safeRelativeNext('/ok\u0000', ORIGIN)).toBe('/');
    expect(safeRelativeNext('/ok\u007f', ORIGIN)).toBe('/');
  });

  test('never returns a value that resolves off-origin', () => {
    const attempts = [
      '/%2F/evil.example',
      '//evil.example/%2e%2e',
      '/\t/evil.example',
      'javascript:alert(1)',
      '/..//evil.example',
    ];
    for (const raw of attempts) {
      const out = safeRelativeNext(raw, ORIGIN);
      expect(new URL(out, ORIGIN).origin).toBe(ORIGIN);
    }
  });
});
