import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/require-admin';
import {
  BASELINE_DATE,
  BASELINE_INSTANT,
  isRetentionRange,
  rangeWindow,
  rowToPoint,
  type RetentionRow,
} from '@/lib/retention-series';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The request-scoped client doesn't carry the Database generic through
// .rpc(), so it's typed by hand here, as the chapters route does.
type RpcClient = {
  rpc: (
    name: string,
    args: Record<string, unknown>
  ) => Promise<{ data: unknown; error: { message: string; code?: string } | null }>;
};

// Function not found: PostgREST's schema-cache miss, or Postgres' own code.
// Both mean migration 050 has not been applied to this database yet.
const RPC_MISSING = new Set(['PGRST202', '42883']);
const INSUFFICIENT_PRIVILEGE = '42501';

/**
 * GET /api/admin/content/retention?range=1D|1W|1M|3M
 *
 * The signup-to-retention funnel for the admin Retention tab: a time series
 * for the chart (1D hourly, others daily), plus the current point and the
 * Nov 6 baseline point for the table. All of it comes from one RPC,
 * public.admin_retention_series (migration 050), which re-checks admin.
 *
 * If 050 isn't applied yet the response is `available: false` with empty
 * data, so deploying the code before the migration doesn't break the tab.
 */
export async function GET(request: Request) {
  const { supabase, error } = await requireAdmin();
  if (error) return error;

  const range = new URL(request.url).searchParams.get('range') ?? '1M';
  if (!isRetentionRange(range)) {
    return NextResponse.json({ error: 'range must be one of 1D, 1W, 1M, 3M' }, { status: 400 });
  }

  const { step, from, to } = rangeWindow(range, new Date());
  const db = supabase as unknown as RpcClient;
  const [seriesRes, baselineRes] = await Promise.all([
    db.rpc('admin_retention_series', {
      p_from: from.toISOString(),
      p_to: to.toISOString(),
      p_step: step,
    }),
    db.rpc('admin_retention_series', {
      p_from: BASELINE_INSTANT,
      p_to: BASELINE_INSTANT,
      p_step: 'day',
    }),
  ]);

  const failed = seriesRes.error ?? baselineRes.error;
  if (failed) {
    if (failed.code && RPC_MISSING.has(failed.code)) {
      return NextResponse.json(
        { range, step, series: [], current: null, baseline: null, baselineDate: BASELINE_DATE, available: false },
        { headers: { 'Cache-Control': 'private, no-store' } }
      );
    }
    if (failed.code === INSUFFICIENT_PRIVILEGE) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    console.error('[admin/retention] rpc failed:', failed.message);
    return NextResponse.json({ error: 'Failed to load retention data' }, { status: 500 });
  }

  const series = ((seriesRes.data ?? []) as RetentionRow[]).map(rowToPoint);
  const baselineRows = (baselineRes.data ?? []) as RetentionRow[];

  return NextResponse.json(
    {
      range,
      step,
      series,
      current: series.length > 0 ? series[series.length - 1] : null,
      baseline: baselineRows.length > 0 ? rowToPoint(baselineRows[0]) : null,
      baselineDate: BASELINE_DATE,
      available: true,
    },
    { headers: { 'Cache-Control': 'private, max-age=30' } }
  );
}
