/**
 * Shared by the admin Retention route and panel: the funnel definition, the
 * stock-style range buttons, and the pure maths that turns RPC rows into
 * chart values. No server-only imports, so the client bundle can use it.
 */

export type RetentionStep = 'hour' | 'day';

export const RETENTION_RANGES = ['1D', '1W', '1M', '3M'] as const;
export type RetentionRange = (typeof RETENTION_RANGES)[number];

/** Look-back windows, like a stock chart: 1D is hourly, the rest are daily. */
export const RANGE_SPEC: Record<RetentionRange, { step: RetentionStep; points: number }> = {
  '1D': { step: 'hour', points: 24 },
  '1W': { step: 'day', points: 7 },
  '1M': { step: 'day', points: 30 },
  '3M': { step: 'day', points: 90 },
};

export function isRetentionRange(v: unknown): v is RetentionRange {
  return typeof v === 'string' && (RETENTION_RANGES as readonly string[]).includes(v);
}

/** The audit date the table's baseline column compares against. */
export const BASELINE_DATE = '2026-11-06';
/** Any instant inside that Cairo day; the RPC snaps it to the end of the day. */
export const BASELINE_INSTANT = '2026-11-06T12:00:00Z';

export const FUNNEL = [
  { key: 'signedUp', label: 'Signed up', short: 'Signed up', color: '#8B98A6' },
  { key: 'confirmed', label: 'Confirmed email', short: 'Confirmed', color: '#0EA5E9' },
  { key: 'started', label: 'Started a quiz', short: 'Started', color: '#8B5CF6' },
  { key: 'finished1', label: 'Finished ≥1 quiz', short: 'Finished ≥1', color: '#00A6A6' },
  { key: 'finished2', label: 'Finished ≥2 quizzes', short: 'Finished ≥2', color: '#10B981' },
  { key: 'days2', label: 'Finished quizzes on 2+ different days', short: '2+ days', color: '#F59E0B' },
  { key: 'days3', label: 'Finished quizzes on 3+ different days', short: '3+ days', color: '#F97316' },
] as const;

export type FunnelKey = (typeof FUNNEL)[number]['key'];
export type RetentionPoint = { t: string } & Record<FunnelKey, number>;

/** One row of public.admin_retention_series, as PostgREST returns it. */
export type RetentionRow = {
  t: string;
  signed_up: number | string;
  confirmed: number | string;
  started: number | string;
  finished_1: number | string;
  finished_2: number | string;
  days_2: number | string;
  days_3: number | string;
};

export function rowToPoint(r: RetentionRow): RetentionPoint {
  return {
    t: r.t,
    signedUp: Number(r.signed_up),
    confirmed: Number(r.confirmed),
    started: Number(r.started),
    finished1: Number(r.finished_1),
    finished2: Number(r.finished_2),
    days2: Number(r.days_2),
    days3: Number(r.days_3),
  };
}

export function rangeWindow(range: RetentionRange, now: Date): { step: RetentionStep; from: Date; to: Date } {
  const { step, points } = RANGE_SPEC[range];
  const unitMs = step === 'hour' ? 3_600_000 : 86_400_000;
  return { step, from: new Date(now.getTime() - (points - 1) * unitMs), to: now };
}

/** Share of signups (as of the same point in time) that reached this step, to 1 decimal. */
export function pctOfSignups(p: RetentionPoint, key: FunnelKey): number {
  if (p.signedUp <= 0) return 0;
  return Math.round((p[key] / p.signedUp) * 1000) / 10;
}

export type ChartMode = 'percent' | 'count';

export function pointValue(p: RetentionPoint, key: FunnelKey, mode: ChartMode): number {
  return mode === 'percent' ? pctOfSignups(p, key) : p[key];
}

/**
 * Round a chart maximum up to a tidy axis end (count: 1/2/5 x 10^n; percent: next
 * multiple of 20, so the chart's 4 gridlines land on 5/10/15/20/25).
 */
export function niceMax(v: number, mode: ChartMode): number {
  if (mode === 'percent') return Math.min(100, Math.max(20, Math.ceil(v / 20) * 20));
  if (v <= 0) return 1;
  const exp = Math.pow(10, Math.floor(Math.log10(v)));
  const f = v / exp;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * exp;
}

const CAIRO = 'Africa/Cairo';

/**
 * Axis / tooltip label for a point. A daily point sits at the END of its Cairo
 * day, so it is labelled with that day (t minus 1 ms); an hourly point is
 * labelled with the time it is "as of".
 */
export function formatPointLabel(iso: string, step: RetentionStep, long = false): string {
  const ms = Date.parse(iso);
  if (step === 'day') {
    return new Intl.DateTimeFormat('en-GB', {
      day: 'numeric',
      month: 'short',
      ...(long ? { year: 'numeric' as const } : {}),
      timeZone: CAIRO,
    }).format(new Date(ms - 1));
  }
  const time = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: CAIRO,
  }).format(new Date(ms));
  if (!long) return time;
  const day = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: CAIRO }).format(
    new Date(ms)
  );
  return `${day}, ${time}`;
}
