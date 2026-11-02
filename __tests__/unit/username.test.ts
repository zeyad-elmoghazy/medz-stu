import { readFileSync } from 'fs';
import { join } from 'path';
import {
  RESERVED_USERNAMES,
  USERNAME_COOLDOWN_DAYS,
  USERNAME_FORMAT_MESSAGE,
  USERNAME_RESERVED_MESSAGE,
  isReservedUsername,
  nextUsernameChangeAt,
  normalizeUsername,
  validateUsername,
} from '@/lib/username';

describe('normalizeUsername', () => {
  test('trims and lowercases', () => {
    expect(normalizeUsername('  Yusuf_K ')).toBe('yusuf_k');
  });
});

describe('validateUsername', () => {
  test('accepts 3–20 lowercase letters, digits and underscores', () => {
    for (const ok of ['abc', 'yusuf_k', 'a1_', '_a_', '123', 'a'.repeat(20)]) {
      expect(validateUsername(ok)).toBeNull();
    }
  });

  test('rejects anything else with the format message', () => {
    for (const bad of ['ab', 'a'.repeat(21), 'has space', 'dash-ed', 'dot.ted', 'UPPER', 'emoji😀', '']) {
      expect(validateUsername(bad)).toBe(USERNAME_FORMAT_MESSAGE);
    }
  });

  test('rejects reserved names with the reserved message', () => {
    expect(validateUsername('admin')).toBe(USERNAME_RESERVED_MESSAGE);
    expect(validateUsername('medizee')).toBe(USERNAME_RESERVED_MESSAGE);
  });
});

describe('isReservedUsername', () => {
  test('catches every reserved word', () => {
    for (const word of RESERVED_USERNAMES) {
      expect(isReservedUsername(word)).toBe(true);
    }
  });

  test('ignores trailing digits and underscores, so numbered clones are caught', () => {
    for (const clone of ['admin1', 'admin_', 'admin_2', 'support99', 'medz__', 'you2024']) {
      expect(isReservedUsername(clone)).toBe(true);
    }
  });

  test('does not flag names that merely contain or start with a reserved word', () => {
    for (const fine of ['administrator_ahmed', 'my_admin', 'adminsh', 'teammate', 'studentzee', 'dryemads1']) {
      expect(isReservedUsername(fine)).toBe(false);
    }
  });

  test('the SQL reserved list (migration 039) is identical to the TS one', () => {
    const sql = readFileSync(
      join(process.cwd(), 'supabase/migrations/039_student_usernames.sql'),
      'utf8'
    );
    const body = sql.match(/= ANY \(ARRAY\[([\s\S]*?)\]\)/)?.[1];
    expect(body).toBeDefined();
    const fromSql = [...(body ?? '').matchAll(/'([a-z0-9_]+)'/g)].map((m) => m[1]);
    expect([...fromSql].sort()).toEqual([...RESERVED_USERNAMES].sort());
  });
});

describe('nextUsernameChangeAt', () => {
  const now = new Date('2026-11-10T12:00:00Z');

  test('null when the username was never changed — the first change is free', () => {
    expect(nextUsernameChangeAt(null, now)).toBeNull();
  });

  test('returns the unlock instant while inside the cooldown', () => {
    const next = nextUsernameChangeAt('2026-11-01T12:00:00Z', now);
    expect(next?.toISOString()).toBe('2026-12-01T12:00:00.000Z');
  });

  test('null once the cooldown has fully passed', () => {
    expect(nextUsernameChangeAt('2026-10-01T12:00:00Z', now)).toBeNull();
  });

  test('locked right up to the exact unlock instant, free at it', () => {
    const changed = new Date(now.getTime() - USERNAME_COOLDOWN_DAYS * 86_400_000 + 1000);
    expect(nextUsernameChangeAt(changed.toISOString(), now)).not.toBeNull();
    const exact = new Date(now.getTime() - USERNAME_COOLDOWN_DAYS * 86_400_000);
    expect(nextUsernameChangeAt(exact.toISOString(), now)).toBeNull();
  });

  test('a malformed timestamp does not lock the student out', () => {
    expect(nextUsernameChangeAt('not-a-date', now)).toBeNull();
  });
});
