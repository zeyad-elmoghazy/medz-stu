import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@/lib/supabase-server';
import type { Database } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type JobStatus = 'queued' | 'processing' | 'completed' | 'failed';

type JobRow = {
  id: string;
  professor_id: string;
  type: string;
  status: JobStatus;
  result: unknown;
  error: string | null;
  created_at: string;
  completed_at: string | null;
};

/**
 * GET /api/jobs/status/[jobId]
 *
 * The professor dashboard polls this every 3s to render the
 * pipeline progress bar. The endpoint is dead simple — read one
 * row, return its status + result.
 *
 * Authorization:
 *   The RLS policy on `jobs` (see migration 003) restricts SELECT
 *   to `professor_id = auth.uid()`, so a professor can only see
 *   their own jobs even if they guess another professor's jobId.
 *   We still check the role here so a non-professor session gets
 *   a clean 403 instead of an empty result.
 */
export async function GET(_request: NextRequest, props: { params: Promise<{ jobId: string }> }) {
  const params = await props.params;
  const supabase = await createRouteHandlerClient<Database>({ cookies });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('jobs' as never)
    .select('*')
    .eq('id', params.jobId)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  const job = data as unknown as JobRow;

  if (job.professor_id !== user.id) {
    // Defensive: RLS should have already filtered this row out
    // for non-owners, so reaching this branch means the policy is
    // misconfigured. Return 403 either way.
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return NextResponse.json({
    jobId: job.id,
    type: job.type,
    status: job.status,
    result: job.result,
    error: job.error,
    createdAt: job.created_at,
    completedAt: job.completed_at,
  });
}
