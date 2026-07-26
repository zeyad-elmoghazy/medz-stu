import { NextRequest, NextResponse } from 'next/server';
import { verifySignatureAppRouter } from '@upstash/qstash/nextjs';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type WorkerPayload = {
  jobId: string;
  professorId: string;
  subjectId: string;
  notesFileUrl: string | null;
  questionsFileUrl: string | null;
};

/**
 * QStash worker for AI question generation.
 *
 * Only QStash calls this URL — the `verifySignatureAppRouter`
 * wrapper rejects any POST without a valid QStash signature
 * (HMAC of the body keyed with QSTASH_CURRENT_SIGNING_KEY /
 * QSTASH_NEXT_SIGNING_KEY). That means:
 *
 *   - A leaked URL is useless to an attacker.
 *   - QStash's automatic key rotation works (current + next).
 *
 * The worker uses the Supabase SERVICE ROLE key — it isn't acting
 * on behalf of a user session and needs to bypass RLS to update
 * the jobs row.
 */
async function handler(request: NextRequest): Promise<NextResponse> {
  let payload: WorkerPayload;
  try {
    payload = (await request.json()) as WorkerPayload;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!payload.jobId || !payload.professorId || !payload.subjectId) {
    return NextResponse.json(
      { error: 'jobId, professorId, and subjectId are required' },
      { status: 400 }
    );
  }

  // The service-role client returned from createClient<Database>(...)
  // collapses to `never` under the auth-helpers-nextjs typing path,
  // so we narrow to the surface this handler actually touches.
  const supabase = serviceClient() as unknown as {
    from: (table: string) => {
      update: (patch: Record<string, unknown>) => {
        eq: (col: string, val: unknown) => Promise<{
          error: { message: string } | null;
        }>;
      };
    };
  };

  // Flip to 'processing' so the polling endpoint can show the
  // intermediate state in the UI pipeline.
  await supabase
    .from('jobs')
    .update({ status: 'processing' })
    .eq('id', payload.jobId);

  try {
    // AI extraction pipeline is not wired yet. Fail the job with
    // a clear message so the professor sees a truthful state on
    // the polling endpoint instead of fake success numbers.
    //
    // When implementing, replace this block with:
    //   const notes = await downloadFile(payload.notesFileUrl);
    //   const questions = await downloadFile(payload.questionsFileUrl);
    //   const extracted = await runExtractionPipeline({ notes, questions });
    //   await supabase.from('questions').insert(extracted.published);
    //   const result = { extracted: extracted.count, published: ..., review: ... };
    //   await supabase.from('jobs').update({ status: 'completed', result, completed_at: ... }).eq('id', payload.jobId);
    //   await invalidateCache(CACHE_KEYS.questionBank(payload.subjectId));
    //   return NextResponse.json({ ok: true, jobId: payload.jobId });
    throw new Error(
      'AI question generation is not yet implemented. Wire an extraction pipeline in app/api/jobs/generate-questions/route.ts before enabling professor uploads.'
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'job failed';
    await supabase
      .from('jobs')
      .update({
        status: 'failed',
        error: message,
        completed_at: new Date().toISOString(),
      })
      .eq('id', payload.jobId);

    // Re-throw so QStash sees a 5xx and triggers a retry.
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set for the worker.'
    );
  }
  return createClient<Database>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Export the verified handler.
 *
 * Signature verification is MANDATORY except in explicit demo mode
 * (NEXT_PUBLIC_DEMO=1) or non-production Node envs. Prod without a
 * signing key is a misconfiguration, not a dev convenience — the
 * previous behavior silently accepted any POST, which is exactly
 * how an internal endpoint gets weaponized.
 */
function buildPost() {
  const hasSigningKey = Boolean(process.env.QSTASH_CURRENT_SIGNING_KEY);
  if (hasSigningKey) return verifySignatureAppRouter(handler);

  const isDemo = process.env.NEXT_PUBLIC_DEMO === '1';
  const isProd = process.env.NODE_ENV === 'production';
  if (isProd && !isDemo) {
    throw new Error(
      'QSTASH_CURRENT_SIGNING_KEY is required in production. ' +
        'Set it in the deployment env, or set NEXT_PUBLIC_DEMO=1 for a demo build.'
    );
  }
  return handler;
}

export const POST = buildPost();
