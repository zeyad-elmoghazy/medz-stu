import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@/lib/supabase-server';
import { z } from 'zod';
import type { Database } from '@/lib/supabase';
import { redis, CACHE_KEYS } from '@/lib/redis';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PatchSchema = z.object({
  question: z.string().min(10).max(2000).optional(),
  choices: z
    .array(z.object({ id: z.string().min(1), text: z.string().min(1) }))
    .min(2)
    .max(5)
    .optional(),
  correctAnswer: z.string().min(1).max(4).optional(),
  explanation: z.string().max(2000).optional(),
  reference: z.string().max(500).optional(),
  chapterId: z.string().uuid().optional(),
  status: z.enum(['draft', 'under_review', 'published', 'archived']).optional(),
  difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
});

async function invalidatePublished(subjectId: string | null) {
  if (!redis || !subjectId) return;
  try {
    await redis.del(
      CACHE_KEYS.subjectList(),
      CACHE_KEYS.questionBank(subjectId)
    );
  } catch {
    // non-fatal
  }
}

export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const supabase = await createRouteHandlerClient<Database>({ cookies });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const questionId = Number(params.id);
  if (!Number.isFinite(questionId)) {
    return NextResponse.json(
      { error: 'Invalid question id' },
      { status: 400 }
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const ownCheck = await (supabase as unknown as {
    from: (t: string) => {
      select: (c: string) => {
        eq: (c: string, v: unknown) => {
          single: () => Promise<{
            data: { professor_id: string | null; subject_id: string } | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
  })
    .from('questions')
    .select('professor_id, subject_id')
    .eq('id', questionId)
    .single();

  if (ownCheck.error || !ownCheck.data) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (
    ownCheck.data.professor_id &&
    ownCheck.data.professor_id !== user.id
  ) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const patch = parsed.data;
  const dbPatch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.question !== undefined) dbPatch.question = patch.question;
  if (patch.choices !== undefined) dbPatch.choices = patch.choices;
  if (patch.correctAnswer !== undefined) dbPatch.correct_answer = patch.correctAnswer;
  if (patch.explanation !== undefined) dbPatch.explanation = patch.explanation;
  if (patch.reference !== undefined) dbPatch.reference = patch.reference;
  if (patch.chapterId !== undefined) dbPatch.chapter_id = patch.chapterId;
  if (patch.status !== undefined) dbPatch.status = patch.status;
  if (patch.difficulty !== undefined) dbPatch.difficulty = patch.difficulty;

  // Adopt orphan seeded rows on first edit.
  if (!ownCheck.data.professor_id) {
    dbPatch.professor_id = user.id;
  }

  const updateRes = await (supabase as unknown as {
    from: (t: string) => {
      update: (r: Record<string, unknown>) => {
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
  })
    .from('questions')
    .update(dbPatch)
    .eq('id', questionId)
    .select('id, chapter_id, status, subject_id')
    .single();

  if (updateRes.error) {
    return NextResponse.json(
      { error: updateRes.error.message },
      { status: 500 }
    );
  }

  if (patch.status === 'published' || patch.status === 'archived') {
    await invalidatePublished(ownCheck.data.subject_id);
  }

  return NextResponse.json({ question: updateRes.data });
}

/**
 * DELETE — soft delete (status = archived). We never hard-delete
 * because quiz_sessions.answers references question ids by
 * position and a hard delete would strand historic score rows.
 */
export async function DELETE(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const supabase = await createRouteHandlerClient<Database>({ cookies });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const questionId = Number(params.id);
  if (!Number.isFinite(questionId)) {
    return NextResponse.json(
      { error: 'Invalid question id' },
      { status: 400 }
    );
  }

  const ownCheck = await (supabase as unknown as {
    from: (t: string) => {
      select: (c: string) => {
        eq: (c: string, v: unknown) => {
          single: () => Promise<{
            data: { professor_id: string | null; subject_id: string } | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
  })
    .from('questions')
    .select('professor_id, subject_id')
    .eq('id', questionId)
    .single();

  if (ownCheck.error || !ownCheck.data) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (
    ownCheck.data.professor_id &&
    ownCheck.data.professor_id !== user.id
  ) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const updRes = await (supabase as unknown as {
    from: (t: string) => {
      update: (r: Record<string, unknown>) => {
        eq: (c: string, v: unknown) => Promise<{
          data: unknown;
          error: { message: string } | null;
        }>;
      };
    };
  })
    .from('questions')
    .update({ status: 'archived', updated_at: new Date().toISOString() })
    .eq('id', questionId);

  if (updRes.error) {
    return NextResponse.json({ error: updRes.error.message }, { status: 500 });
  }

  await invalidatePublished(ownCheck.data.subject_id);
  return NextResponse.json({ ok: true });
}
