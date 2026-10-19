import {
  FLAG_DETAIL_MAX,
  FLAG_REASONS,
  FLAG_REASON_LABELS,
  FlagBodySchema,
} from '@/lib/question-flags';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('FlagBodySchema', () => {
  test('accepts every known reason with no detail', () => {
    for (const reason of FLAG_REASONS) {
      const parsed = FlagBodySchema.safeParse({ reason });
      expect(parsed.success).toBe(true);
    }
  });

  test('rejects an unknown or missing reason', () => {
    expect(FlagBodySchema.safeParse({ reason: 'spam' }).success).toBe(false);
    expect(FlagBodySchema.safeParse({}).success).toBe(false);
    expect(FlagBodySchema.safeParse({ detail: 'no reason given' }).success).toBe(false);
  });

  test('trims the detail', () => {
    const parsed = FlagBodySchema.parse({ reason: 'typo', detail: '  option B has a typo  ' });
    expect(parsed.detail).toBe('option B has a typo');
  });

  test('allows a detail of exactly the cap and rejects one character over', () => {
    expect(
      FlagBodySchema.safeParse({ reason: 'other', detail: 'x'.repeat(FLAG_DETAIL_MAX) }).success
    ).toBe(true);
    expect(
      FlagBodySchema.safeParse({ reason: 'other', detail: 'x'.repeat(FLAG_DETAIL_MAX + 1) }).success
    ).toBe(false);
  });

  test('rejects a non-string detail', () => {
    expect(FlagBodySchema.safeParse({ reason: 'other', detail: 42 }).success).toBe(false);
  });
});

describe('flag reason vocabulary', () => {
  test('every reason has a label', () => {
    for (const reason of FLAG_REASONS) {
      expect(FLAG_REASON_LABELS[reason]).toEqual(expect.any(String));
      expect(FLAG_REASON_LABELS[reason].length).toBeGreaterThan(0);
    }
  });

  // The reason list and the detail cap live in two places: this module
  // and the CHECK constraints in migration 033. This pins them together
  // so changing one without the other fails here instead of in prod.
  test('migration 033 CHECK constraints match the TypeScript vocabulary', () => {
    const sql = readFileSync(
      join(__dirname, '../../supabase/migrations/033_question_flag_admin.sql'),
      'utf-8'
    );
    const reasonCheck = /reason IN \(([^)]+)\)/.exec(sql);
    expect(reasonCheck).not.toBeNull();
    const sqlReasons = reasonCheck![1]
      .split(',')
      .map((s) => s.trim().replace(/^'|'$/g, ''))
      .sort();
    expect(sqlReasons).toEqual([...FLAG_REASONS].sort());

    const lengthCheck = /char_length\(detail\) <= (\d+)/.exec(sql);
    expect(lengthCheck).not.toBeNull();
    expect(Number(lengthCheck![1])).toBe(FLAG_DETAIL_MAX);
  });
});
