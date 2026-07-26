import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@/lib/supabase-server';
import { z } from 'zod';
import type { Database } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PatchSchema = z.object({
  status: z.enum(['queued', 'processing', 'completed', 'failed']).optional(),
  questionsExtracted: z.number().int().nonnegative().optional(),
  questionsPublished: z.number().int().nonnegative().optional(),
  questionsUnderReview: z.number().int().nonnegative().optional(),
  errorMessage: z.string().max(1000).optional(),
});

export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const supabase = await createRouteHandlerClient<Database>({ cookies });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const d = parsed.data;
  const dbPatch: Record<string, unknown> = {};
  if (d.status !== undefined) dbPatch.status = d.status;
  if (d.questionsExtracted !== undefined)
    dbPatch.questions_extracted = d.questionsExtracted;
  if (d.questionsPublished !== undefined)
    dbPatch.questions_published = d.questionsPublished;
  if (d.questionsUnderReview !== undefined)
    dbPatch.questions_under_review = d.questionsUnderReview;
  if (d.errorMessage !== undefined) dbPatch.error_message = d.errorMessage;
  if (d.status === 'completed' || d.status === 'failed') {
    dbPatch.completed_at = new Date().toISOString();
  }

  const updRes = await (supabase as unknown as {
    from: (t: string) => {
      update: (r: Record<string, unknown>) => {
        eq: (c: string, v: unknown) => {
          eq: (c: string, v: unknown) => {
            select: (c: string) => {
              single: () => Promise<{
                data: Record<string, unknown> | null;
                error: { message: string } | null;
              }>;
            };
          };
        };
      };
    };
  })
    .from('upload_jobs')
    .update(dbPatch)
    .eq('id', params.id)
    .eq('professor_id', user.id)
    .select('id, status, questions_extracted, questions_published, completed_at')
    .single();

  if (updRes.error) {
    return NextResponse.json({ error: updRes.error.message }, { status: 500 });
  }
  return NextResponse.json({ job: updRes.data });
}
