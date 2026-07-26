import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@/lib/supabase-server';
import { z } from 'zod';
import type { Database } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CreateJobSchema = z.object({
  moduleCode: z.string().min(1),
  chapterId: z.string().uuid(),
  method: z.enum(['ai', 'manual', 'import']),
  notesFileName: z.string().max(255).optional(),
  questionsFileName: z.string().max(255).optional(),
});

/**
 * GET /api/professor/upload-jobs
 * List the calling professor's recent upload jobs.
 */
export async function GET(request: Request) {
  const supabase = await createRouteHandlerClient<Database>({ cookies });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const limit = Math.min(Number(searchParams.get('limit') ?? '10'), 50);

  const res = await (supabase as unknown as {
    from: (t: string) => {
      select: (c: string) => {
        eq: (c: string, v: unknown) => {
          order: (c: string, o: { ascending: boolean }) => {
            limit: (n: number) => Promise<{
              data: Record<string, unknown>[] | null;
              error: { message: string } | null;
            }>;
          };
        };
      };
    };
  })
    .from('upload_jobs')
    .select(
      'id, module_code, chapter_id, method, status, questions_extracted, questions_published, questions_under_review, notes_file_name, questions_file_name, created_at, completed_at'
    )
    .eq('professor_id', user.id)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (res.error) {
    return NextResponse.json({ error: res.error.message }, { status: 500 });
  }
  return NextResponse.json({ jobs: res.data ?? [] });
}

/**
 * POST /api/professor/upload-jobs
 *
 * Creates an upload_jobs row in 'queued' state. The AI wizard
 * simulates progress client-side then PATCHes /:id to
 * 'completed' with the extracted counts. Real AI extraction is
 * out of scope here — this endpoint is just the job record
 * that the design's status tracker reads.
 */
export async function POST(request: Request) {
  const supabase = await createRouteHandlerClient<Database>({ cookies });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = CreateJobSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const d = parsed.data;

  const insertRes = await (supabase as unknown as {
    from: (t: string) => {
      insert: (r: Record<string, unknown>) => {
        select: (c: string) => {
          single: () => Promise<{
            data: Record<string, unknown> | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
  })
    .from('upload_jobs')
    .insert({
      professor_id: user.id,
      module_code: d.moduleCode,
      chapter_id: d.chapterId,
      method: d.method,
      notes_file_name: d.notesFileName ?? null,
      questions_file_name: d.questionsFileName ?? null,
      status: 'queued',
    })
    .select('id, status, created_at')
    .single();

  if (insertRes.error) {
    return NextResponse.json(
      { error: insertRes.error.message },
      { status: 500 }
    );
  }
  return NextResponse.json({ job: insertRes.data }, { status: 201 });
}
