import { isLocalSupabaseUrl, isSafeSupabaseTestUrl } from '../helpers/test-env-guard';

const PROD = 'https://usiuoyvrphitqsyxwoty.supabase.co';

describe('isLocalSupabaseUrl', () => {
  test('accepts loopback hosts', () => {
    expect(isLocalSupabaseUrl('http://127.0.0.1:54321')).toBe(true);
    expect(isLocalSupabaseUrl('http://localhost:54321')).toBe(true);
    expect(isLocalSupabaseUrl('http://[::1]:54321')).toBe(true);
  });

  test('rejects hosted and malformed urls', () => {
    expect(isLocalSupabaseUrl('https://abcd.supabase.co')).toBe(false);
    expect(isLocalSupabaseUrl('')).toBe(false);
    expect(isLocalSupabaseUrl('not a url')).toBe(false);
  });
});

describe('isSafeSupabaseTestUrl', () => {
  test('local stack is always allowed', () => {
    expect(isSafeSupabaseTestUrl('http://127.0.0.1:54321', false)).toBe(true);
  });

  test('production project is never allowed, even with the remote opt-in', () => {
    expect(isSafeSupabaseTestUrl(PROD, false)).toBe(false);
    expect(isSafeSupabaseTestUrl(PROD, true)).toBe(false);
  });

  test('other hosted projects need the explicit opt-in', () => {
    expect(isSafeSupabaseTestUrl('https://abcd.supabase.co', false)).toBe(false);
    expect(isSafeSupabaseTestUrl('https://abcd.supabase.co', true)).toBe(true);
  });

  test('empty url is never safe', () => {
    expect(isSafeSupabaseTestUrl('', true)).toBe(false);
  });
});
