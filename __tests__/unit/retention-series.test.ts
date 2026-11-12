import {
  BASELINE_DATE,
  BASELINE_INSTANT,
  FUNNEL,
  RANGE_SPEC,
  RETENTION_RANGES,
  formatPointLabel,
  isRetentionRange,
  niceMax,
  pctOfSignups,
  pointValue,
  rangeWindow,
  rowToPoint,
  type RetentionPoint,
} from '@/lib/retention-series';

const point = (over: Partial<RetentionPoint> = {}): RetentionPoint => ({
  t: '2026-01-10T22:00:00Z',
  signedUp: 270,
  confirmed: 220,
  started: 130,
  finished1: 70,
  finished2: 51,
  days2: 26,
  days3: 10,
  ...over,
});

describe('retention ranges', () => {
  test('the four stock-style buttons are 1D, 1W, 1M, 3M and nothing else is valid', () => {
    expect([...RETENTION_RANGES]).toEqual(['1D', '1W', '1M', '3M']);
    expect(isRetentionRange('1M')).toBe(true);
    expect(isRetentionRange('1Y')).toBe(false);
    expect(isRetentionRange(null)).toBe(false);
  });

  test('1D is hourly, the longer ranges are daily', () => {
    expect(RANGE_SPEC['1D'].step).toBe('hour');
    expect(RANGE_SPEC['1W'].step).toBe('day');
    expect(RANGE_SPEC['1M'].step).toBe('day');
    expect(RANGE_SPEC['3M'].step).toBe('day');
  });

  test('rangeWindow looks back (points - 1) units from now and stays under the RPC cap of 100 points', () => {
    const now = new Date('2026-11-12T12:00:00Z');
    const d = rangeWindow('1D', now);
    expect(d.to).toBe(now);
    expect(now.getTime() - d.from.getTime()).toBe(23 * 3_600_000);
    expect(now.getTime() - rangeWindow('3M', now).from.getTime()).toBe(89 * 86_400_000);
    for (const r of RETENTION_RANGES) expect(RANGE_SPEC[r].points).toBeLessThanOrEqual(99);
  });
});

describe('rowToPoint', () => {
  test('turns the RPC row (bigint may arrive as a string) into numbers', () => {
    expect(
      rowToPoint({
        t: '2026-11-06T22:00:00Z',
        signed_up: '270',
        confirmed: 220,
        started: '130',
        finished_1: 70,
        finished_2: '51',
        days_2: 26,
        days_3: '10',
      })
    ).toEqual({
      t: '2026-11-06T22:00:00Z',
      signedUp: 270,
      confirmed: 220,
      started: 130,
      finished1: 70,
      finished2: 51,
      days2: 26,
      days3: 10,
    });
  });
});

describe('chart values', () => {
  test('pctOfSignups matches the audit table (to 1 decimal) and is 0 with no signups', () => {
    expect(pctOfSignups(point(), 'confirmed')).toBe(81.5);
    expect(pctOfSignups(point(), 'days2')).toBe(9.6);
    expect(pctOfSignups(point(), 'signedUp')).toBe(100);
    expect(pctOfSignups(point({ signedUp: 0, confirmed: 0 }), 'confirmed')).toBe(0);
  });

  test('pointValue switches between percent and raw count', () => {
    expect(pointValue(point(), 'started', 'percent')).toBe(48.1);
    expect(pointValue(point(), 'started', 'count')).toBe(130);
  });

  test('niceMax rounds up to a tidy axis end', () => {
    expect(niceMax(0, 'percent')).toBe(20);
    expect(niceMax(48.1, 'percent')).toBe(60);
    expect(niceMax(87, 'percent')).toBe(100);
    expect(niceMax(100, 'percent')).toBe(100);
    expect(niceMax(0, 'count')).toBe(1);
    expect(niceMax(3, 'count')).toBe(5);
    expect(niceMax(270, 'count')).toBe(500);
    expect(niceMax(180, 'count')).toBe(200);
  });

  test('the funnel has the 7 steps of the audit table, in order', () => {
    expect(FUNNEL.map((f) => f.key)).toEqual([
      'signedUp',
      'confirmed',
      'started',
      'finished1',
      'finished2',
      'days2',
      'days3',
    ]);
  });

  test('the baseline is the Nov 6 audit date, and its instant falls inside that Cairo day', () => {
    expect(BASELINE_DATE).toBe('2026-11-06');
    expect(BASELINE_INSTANT.startsWith(BASELINE_DATE)).toBe(true);
  });
});

describe('formatPointLabel', () => {
  test('a daily point sits at the END of its Cairo day, so it is labelled with that day', () => {
    // Winter: Cairo = UTC+2, so the end of 10 Jan Cairo is 22:00Z.
    expect(formatPointLabel('2026-01-10T22:00:00Z', 'day')).toBe('10 Jan');
    expect(formatPointLabel('2026-01-10T22:00:00Z', 'day', true)).toBe('10 Jan 2026');
  });

  test('an hourly point is labelled with the Cairo time it is as-of', () => {
    expect(formatPointLabel('2026-01-10T20:00:00Z', 'hour')).toBe('22:00');
    expect(formatPointLabel('2026-01-10T22:00:00Z', 'hour')).toBe('00:00');
    expect(formatPointLabel('2026-01-10T22:00:00Z', 'hour', true)).toBe('11 Jan, 00:00');
  });
});
