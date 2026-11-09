import {
  isSignupSource,
  parseUtmCookie,
  readCookie,
  sanitizeUtm,
  serializeUtmCookie,
  utmFromSearchParams,
} from '@/lib/signup-attribution';

describe('signup attribution', () => {
  it('accepts only the five known sources', () => {
    for (const s of ['instagram', 'tiktok', 'friend', 'class_group', 'other']) {
      expect(isSignupSource(s)).toBe(true);
    }
    expect(isSignupSource('facebook')).toBe(false);
    expect(isSignupSource(undefined)).toBe(false);
    expect(isSignupSource('')).toBe(false);
  });

  it('keeps only utm_* keys, trimmed and capped at 100 chars', () => {
    const utm = sanitizeUtm({
      utm_source: '  instagram ',
      utm_campaign: 'x'.repeat(300),
      utm_medium: '',
      utm_term: 42,
      role: 'admin',
      __proto__: { utm_content: 'nope' },
    });
    expect(utm).toEqual({ utm_source: 'instagram', utm_campaign: 'x'.repeat(100) });
  });

  it('reads utm params from a landing URL', () => {
    const params = new URL('https://www.medizee.app/?utm_source=tiktok&utm_medium=bio&ref=1').searchParams;
    expect(utmFromSearchParams(params)).toEqual({ utm_source: 'tiktok', utm_medium: 'bio' });
  });

  it('round-trips the cookie and survives garbage', () => {
    const utm = { utm_source: 'tiktok', utm_campaign: '50%off & more' };
    const cookie = serializeUtmCookie(utm);
    // Server side sees the decoded JSON, document.cookie the encoded form.
    expect(parseUtmCookie(cookie)).toEqual(utm);
    expect(parseUtmCookie(encodeURIComponent(cookie))).toEqual(utm);
    expect(parseUtmCookie('%E0%A4%A')).toEqual({});
    expect(parseUtmCookie('not-json')).toEqual({});
    expect(parseUtmCookie(null)).toEqual({});
  });

  it('readCookie finds a value among several', () => {
    expect(readCookie('mz_utm', 'a=1; mz_utm=abc%3D; b=2')).toBe('abc%3D');
    expect(readCookie('missing', 'a=1')).toBeNull();
  });
});
