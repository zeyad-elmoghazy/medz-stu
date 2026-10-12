import {
  deleteAccountSchema,
  passwordChangeSchema,
  profilePatchSchema,
} from '@/lib/profile-schema';

describe('profilePatchSchema', () => {
  test('accepts each editable field on its own', () => {
    expect(profilePatchSchema.safeParse({ full_name: 'Yusuf Khalil' }).success).toBe(true);
    expect(profilePatchSchema.safeParse({ username: 'yusuf_k' }).success).toBe(true);
    expect(profilePatchSchema.safeParse({ academic_year: 3 }).success).toBe(true);
    expect(profilePatchSchema.safeParse({ notify_email: false }).success).toBe(true);
    expect(profilePatchSchema.safeParse({ notify_reminders: true }).success).toBe(true);
  });

  test('trims the name and normalises the username to lowercase', () => {
    const parsed = profilePatchSchema.parse({ full_name: '  Yusuf  ', username: 'Yusuf_K' });
    expect(parsed.full_name).toBe('Yusuf');
    expect(parsed.username).toBe('yusuf_k');
  });

  test('rejects an empty patch', () => {
    expect(profilePatchSchema.safeParse({}).success).toBe(false);
  });

  test('rejects unknown keys — students must not be able to patch xp or role', () => {
    expect(profilePatchSchema.safeParse({ total_xp: 999999 }).success).toBe(false);
    expect(profilePatchSchema.safeParse({ role: 'admin' }).success).toBe(false);
    expect(profilePatchSchema.safeParse({ full_name: 'A', total_xp: 1 }).success).toBe(false);
    // Session is derived server-side, never client-supplied.
    expect(profilePatchSchema.safeParse({ academic_year_session: 2020 }).success).toBe(false);
  });

  test('rejects blank or over-long names', () => {
    expect(profilePatchSchema.safeParse({ full_name: '   ' }).success).toBe(false);
    expect(profilePatchSchema.safeParse({ full_name: 'x'.repeat(81) }).success).toBe(false);
    expect(profilePatchSchema.safeParse({ full_name: 'x'.repeat(80) }).success).toBe(true);
  });

  test('rejects malformed usernames', () => {
    for (const bad of ['ab', 'a'.repeat(21), 'has space', 'dash-ed', 'emoji😀', 'dot.ted']) {
      expect(profilePatchSchema.safeParse({ username: bad }).success).toBe(false);
    }
    expect(profilePatchSchema.safeParse({ username: 'abc' }).success).toBe(true);
    expect(profilePatchSchema.safeParse({ username: 'a'.repeat(20) }).success).toBe(true);
  });

  test('rejects academic years outside 1–5 and non-integers', () => {
    for (const bad of [0, 6, -1, 2.5, '3', null]) {
      expect(profilePatchSchema.safeParse({ academic_year: bad }).success).toBe(false);
    }
  });
});

describe('passwordChangeSchema', () => {
  test('accepts a valid change', () => {
    expect(
      passwordChangeSchema.safeParse({ current: 'old-password', next: 'new-password-1' }).success
    ).toBe(true);
  });

  test('requires the current password', () => {
    expect(passwordChangeSchema.safeParse({ current: '', next: 'new-password-1' }).success).toBe(false);
  });

  test('requires at least 8 characters for the new password, matching reset-password', () => {
    expect(passwordChangeSchema.safeParse({ current: 'old-password', next: '1234567' }).success).toBe(false);
    expect(passwordChangeSchema.safeParse({ current: 'old-password', next: '12345678' }).success).toBe(true);
  });

  test('caps the new password at 72 characters (bcrypt limit)', () => {
    expect(passwordChangeSchema.safeParse({ current: 'old-password', next: 'x'.repeat(73) }).success).toBe(false);
  });

  test('rejects reusing the current password', () => {
    expect(passwordChangeSchema.safeParse({ current: 'same-password', next: 'same-password' }).success).toBe(false);
  });

  test('rejects extra keys', () => {
    expect(
      passwordChangeSchema.safeParse({ current: 'old-password', next: 'new-password-1', extra: 1 }).success
    ).toBe(false);
  });
});

describe('deleteAccountSchema', () => {
  test('requires a non-empty confirmation', () => {
    expect(deleteAccountSchema.safeParse({ confirm: 'me@uni.edu' }).success).toBe(true);
    expect(deleteAccountSchema.safeParse({ confirm: '' }).success).toBe(false);
    expect(deleteAccountSchema.safeParse({}).success).toBe(false);
  });
});
