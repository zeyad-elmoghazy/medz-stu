import {
  ACADEMIC_YEAR_MAX,
  ACADEMIC_YEAR_MIN,
  academicSession,
  currentAcademicYear,
  formatSession,
  isValidAcademicYear,
} from '@/lib/academic-year';

/**
 * An academic session starts on 1 September in Africa/Cairo and is
 * identified by the calendar year it starts in (2026 = Sep 2026 –
 * Aug 2027). Egypt observes DST in summer (UTC+3), so 1 Sep 00:00
 * Cairo is 31 Aug 21:00 UTC.
 */
describe('academicSession', () => {
  test('the last instant before 1 Sep (Cairo) still belongs to the previous session', () => {
    expect(academicSession(new Date('2026-08-31T20:59:59Z'))).toBe(2025);
  });

  test('1 Sep 00:00 Cairo starts the new session', () => {
    expect(academicSession(new Date('2026-08-31T21:00:00Z'))).toBe(2026);
  });

  test('mid-year dates belong to the session that started the previous September', () => {
    expect(academicSession(new Date('2027-01-15T12:00:00Z'))).toBe(2026);
    expect(academicSession(new Date('2027-06-30T12:00:00Z'))).toBe(2026);
  });

  test('late-year dates belong to the session that just started', () => {
    expect(academicSession(new Date('2026-12-31T12:00:00Z'))).toBe(2026);
  });

  test('the year boundary uses Cairo time, not UTC', () => {
    // 31 Dec 22:30 UTC is already 1 Jan in Cairo (UTC+2 in winter);
    // still the same session either way.
    expect(academicSession(new Date('2026-12-31T22:30:00Z'))).toBe(2026);
  });
});

describe('currentAcademicYear', () => {
  const aug2026 = new Date('2026-08-15T12:00:00Z');
  const sep2026 = new Date('2026-09-02T12:00:00Z');

  test('returns the chosen year within the same session', () => {
    expect(currentAcademicYear(2, 2025, aug2026)).toBe(2);
  });

  test('advances by one when a new September has started', () => {
    expect(currentAcademicYear(2, 2025, sep2026)).toBe(3);
  });

  test('advances by the number of Septembers elapsed', () => {
    expect(currentAcademicYear(1, 2023, sep2026)).toBe(4);
  });

  test(`is capped at year ${ACADEMIC_YEAR_MAX}`, () => {
    expect(currentAcademicYear(4, 2020, sep2026)).toBe(ACADEMIC_YEAR_MAX);
    expect(currentAcademicYear(ACADEMIC_YEAR_MAX, 2026, new Date('2035-10-01T00:00:00Z'))).toBe(
      ACADEMIC_YEAR_MAX
    );
  });

  test('never goes below the stored year if the stored session is in the future', () => {
    expect(currentAcademicYear(2, 2030, sep2026)).toBe(2);
  });

  test('returns null when the year or the session is unknown', () => {
    expect(currentAcademicYear(null, 2025, sep2026)).toBeNull();
    expect(currentAcademicYear(2, null, sep2026)).toBeNull();
    expect(currentAcademicYear(undefined, undefined, sep2026)).toBeNull();
  });

  test('returns null for a stored year outside the supported range', () => {
    expect(currentAcademicYear(0, 2025, sep2026)).toBeNull();
    expect(currentAcademicYear(ACADEMIC_YEAR_MAX + 1, 2025, sep2026)).toBeNull();
  });
});

describe('isValidAcademicYear', () => {
  test('accepts integers in range', () => {
    for (let y = ACADEMIC_YEAR_MIN; y <= ACADEMIC_YEAR_MAX; y++) {
      expect(isValidAcademicYear(y)).toBe(true);
    }
  });

  test('rejects out-of-range, non-integer and non-number values', () => {
    expect(isValidAcademicYear(0)).toBe(false);
    expect(isValidAcademicYear(ACADEMIC_YEAR_MAX + 1)).toBe(false);
    expect(isValidAcademicYear(2.5)).toBe(false);
    expect(isValidAcademicYear('3')).toBe(false);
    expect(isValidAcademicYear(null)).toBe(false);
    expect(isValidAcademicYear(NaN)).toBe(false);
  });
});

describe('formatSession', () => {
  test('formats as start/short-end', () => {
    expect(formatSession(2026)).toBe('2026/27');
    expect(formatSession(2099)).toBe('2099/00');
  });
});
