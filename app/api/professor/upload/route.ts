import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@/lib/supabase-server';
import { z } from 'zod';
import { applyRateLimit } from '@/lib/apply-rate-limit';
import { uploadLimiter } from '@/lib/rate-limit';
import { enqueue, QUEUE_URLS } from '@/lib/queue';
import type { Database, UserRole } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UploadSchema = z
  .object({
    subjectId: z.string().min(1).max(64),
    notesFileUrl: z.string().url().max(2048).optional(),
    questionsFileUrl: z.string().url().max(2048).optional(),
  })
  .refine(
    (v) => Boolean(v.notesFileUrl || v.questionsFileUrl),
    { message: 'At least one of notesFileUrl or questionsFileUrl is required' }
  );

/**
 * POST /api/professor/upload
 *
 * Returns IMMEDIATELY after enqueueing the AI generation job.
 *
 * Why:
 *   AI extraction takes 30+ seconds and is the kind of work that
 *   blows past Vercel's per-request timeouts at scale. Instead of
 *   blocking the HTTP response, we:
 *     1. Insert a row in `jobs` so the professor can poll status.
 *     2. Hand the workload to QStash; QStash will POST our worker
 *        endpoint (with signature) and retry on failure.
 *     3. Return the jobId so the dashboard can poll
 *        /api/jobs/status/[jobId] every few seconds.
 *
 * The professor sees a live status pipeline; the API stays
 * responsive even under burst load.
 */
export async function POST(request: NextRequest) {
  const supabase = await createRouteHandlerClient<Database>({ cookies });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const profileQuery = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  const profile = profileQuery.data as { role: UserRole } | null;

  const role = profile?.role;
  if (role !== 'professor' && role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Auth-helpers-nextjs 0.8 collapses the Database generic into never
  // for the chained calls below — narrow to the surface this handler
  // actually touches.
  const sb = supabase as unknown as {
    from: (table: string) => {
      insert: (row: Record<string, unknown>) => Promise<{
        error: { message: string } | null;
      }>;
      update: (patch: Record<string, unknown>) => {
        eq: (col: string, val: unknown) => Promise<{
          error: { message: string } | null;
        }>;
      };
    };
  };

  const limited = await applyRateLimit(request, uploadLimiter, user.id);
  if (limited) return limited;

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = UploadSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid payload', issues: parsed.error.issues },
      { status: 400 }
    );
  }
  const payload = parsed.data;

  // Generate the jobId BEFORE enqueueing so the row exists by the
  // time the worker tries to look it up. Otherwise we'd race the
  // QStash delivery against our own INSERT.
  const jobId = crypto.randomUUID();

  const { error: insertError } = await sb.from('jobs').insert({
    id: jobId,
    professor_id: user.id,
    type: 'generate_questions',
    status: 'queued',
    created_at: new Date().toISOString(),
  });

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  // Enqueue. The worker reads jobId from the payload to know
  // which row to update on completion.
  try {
    await enqueue(QUEUE_URLS.generateQuestions, {
      jobId,
      professorId: user.id,
      subjectId: payload.subjectId,
      notesFileUrl: payload.notesFileUrl ?? null,
      questionsFileUrl: payload.questionsFileUrl ?? null,
    });
  } catch (err) {
    // If we can't reach QStash, mark the job failed so polling
    // surfaces the error instead of spinning forever.
    await sb
      .from('jobs')
      .update({
        status: 'failed',
        error: err instanceof Error ? err.message : 'enqueue failed',
        completed_at: new Date().toISOString(),
      })
      .eq('id', jobId);

    return NextResponse.json(
      { error: 'Failed to enqueue job', jobId },
      { status: 502 }
    );
  }

  return NextResponse.json({
    jobId,
    message: `Content upload queued. Check status at /api/jobs/status/${jobId}`,
  });
}
