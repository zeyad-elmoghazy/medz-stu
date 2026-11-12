// Drives the REAL GET /api/admin/content/retention handler with requireAdmin
// and the RPC stubbed.
import { NextResponse } from 'next/server';

const rpc = jest.fn();
const mockRequireAdmin = jest.fn();
jest.mock('@/lib/require-admin', () => ({
  requireAdmin: (...args: unknown[]) => mockRequireAdmin(...args),
}));

import { GET } from '@/app/api/admin/content/retention/route';
import { BASELINE_DATE, BASELINE_INSTANT } from '@/lib/retention-series';

const row = (t: string, signedUp: number | string, finished1 = 0) => ({
  t,
  signed_up: signedUp,
  confirmed: Math.floor(Number(signedUp) * 0.8),
  started: Math.floor(Number(signedUp) * 0.5),
  finished_1: finished1,
  finished_2: 0,
  days_2: 0,
  days_3: 0,
});

const call = (qs = '') => GET(new Request(`http://localhost/api/admin/content/retention${qs}`));

beforeEach(() => {
  rpc.mockReset();
  mockRequireAdmin.mockReset();
  mockRequireAdmin.mockResolvedValue({ supabase: { rpc }, user: { id: 'admin' }, error: null });
});

describe('GET /api/admin/content/retention', () => {
  test('returns the gate response and never calls the RPC when not an admin', async () => {
    mockRequireAdmin.mockResolvedValue({
      supabase: null,
      user: null,
      error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    });
    const res = await call();
    expect(res.status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });

  test('rejects an unknown range with 400', async () => {
    const res = await call('?range=1Y');
    expect(res.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  test.each([
    ['1D', 'hour', 23 * 3_600_000],
    ['1W', 'day', 6 * 86_400_000],
    ['1M', 'day', 29 * 86_400_000],
    ['3M', 'day', 89 * 86_400_000],
  ])('range %s asks the RPC for %s points over the right window, plus the baseline point', async (range, step, spanMs) => {
    rpc.mockResolvedValue({ data: [], error: null });
    const res = await call(`?range=${range}`);
    expect(res.status).toBe(200);

    expect(rpc).toHaveBeenCalledTimes(2);
    const [name, args] = rpc.mock.calls.find((c) => c[1].p_from !== BASELINE_INSTANT)!;
    expect(name).toBe('admin_retention_series');
    expect(args.p_step).toBe(step);
    expect(Date.parse(args.p_to) - Date.parse(args.p_from)).toBe(spanMs);

    const baseCall = rpc.mock.calls.find((c) => c[1].p_from === BASELINE_INSTANT)!;
    expect(baseCall[1]).toEqual({ p_from: BASELINE_INSTANT, p_to: BASELINE_INSTANT, p_step: 'day' });
  });

  test('defaults to 1M and maps rows to points: current = last point, baseline = the audit-date row', async () => {
    rpc.mockImplementation(async (_n: string, a: { p_from: string }) =>
      a.p_from === BASELINE_INSTANT
        ? { data: [row('2026-11-06T22:00:00Z', '181', 40)], error: null }
        : { data: [row('2026-11-10T22:00:00Z', 250, 60), row('2026-11-11T22:00:00Z', 270, 70)], error: null }
    );
    const body = await (await call()).json();
    expect(body.range).toBe('1M');
    expect(body.step).toBe('day');
    expect(body.available).toBe(true);
    expect(body.baselineDate).toBe(BASELINE_DATE);
    expect(body.series).toHaveLength(2);
    expect(body.current).toMatchObject({ t: '2026-11-11T22:00:00Z', signedUp: 270, finished1: 70 });
    expect(body.baseline).toMatchObject({ signedUp: 181, finished1: 40 });
  });

  test('an empty series gives current: null instead of crashing', async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    const body = await (await call('?range=1D')).json();
    expect(body.series).toEqual([]);
    expect(body.current).toBeNull();
    expect(body.baseline).toBeNull();
    expect(body.available).toBe(true);
  });

  test.each(['PGRST202', '42883'])('migration 050 not applied (%s) -> 200 with available: false', async (code) => {
    rpc.mockResolvedValue({ data: null, error: { code, message: 'function not found' } });
    const res = await call();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.available).toBe(false);
    expect(body.series).toEqual([]);
    expect(body.current).toBeNull();
  });

  test('the RPC refusing a non-admin (42501) -> 403', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'admin_only' } });
    expect((await call()).status).toBe(403);
  });

  test('any other RPC error -> 500 without leaking the database message', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    rpc.mockResolvedValue({ data: null, error: { code: 'XX000', message: 'secret internal detail' } });
    const res = await call();
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain('secret internal detail');
    spy.mockRestore();
  });
});
