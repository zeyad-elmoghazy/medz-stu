import { NextRequest, NextResponse } from 'next/server';
import { publicDbError } from '@/lib/api-error';
import { cookies } from 'next/headers';
import { createRouteHandlerClient, untypedFrom } from '@/lib/supabase-server';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { Database, UserRole } from '@/lib/supabase';
import { applyRateLimit } from '@/lib/apply-rate-limit';
import { progressLimiter } from '@/lib/rate-limit';
import { saveChapterProgress } from '@/lib/server/chapter-quiz-save';
import { gatedReveals, revealsToJson } from '@/lib/server/reveal';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * /api/student/chapters/[chapterId]/progress
 *
 * Server-side home for an UNFINISHED chapter-quiz attempt (table
 * `chapter_quiz_progress`, supabase/migrations/032). Before this
 * existed, "Save & Exit" only wrote localStorage and a half-finished
 * chapter was invisible to the rest of the app.
 *
 *   GET    -> the student's saved attempt for this chapter, or null.
 *   PUT    -> save the attempt so far. Called after every answered
 *             question and by Save & Exit (which waits for it).
 *   DELETE -> discard the saved attempt ("Start over", fresh starts).
 *
 * The attempt is turned into a completed `quiz_sessions` row — and
 * this row deleted — by the sibling /submit route, so XP, streak and
 * the leaderboard are still credited exactly once, at completion.
 *
 * Writes use the service-role client (students only have a read
 * policy on the table); every write is scoped to the authenticated
 * student's id.
 */

const ParamsSchema = z.object({ chapterId: z.string().uuid() });

const PutBodySchema = z.object({
  answers: z
    .record(z.string(), z.string().max(64))
    .refine((o) => Object.keys(o).length <= 5000, { message: 'too many answers' }),
  currentQuestionIndex: z.number().int().min(0).max(100_000),
  // Present only for a "Practice mistakes" subset run.
  questionIds: z.array(z.number().int()).max(5000).optional(),
});

type ProgressRow = {
  answers: Record<string, string> | null;
  question_ids: number[] | null;
  current_question_index: number;
  total_questions: number;
  updated_at: string;
};

const NO_STORE = { 'Cache-Control': 'no-store' } as const;

type RouteSupabase = Awaited<ReturnType<typeof createRouteHandlerClient<Database>>>;

// Discriminated on `error` so callers narrow with `if (auth.error)`.
type AuthResult =
  | { error: NextResponse }
  | { error: null; supabase: RouteSupabase; user: { id: string } };

async function authenticate(request: NextRequest): Promise<AuthResult> {
  const supabase = await createRouteHandlerClient<Database>({ cookies });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  // The role lookup and the rate-limit check don't depend on each other, so
  // they run together: one round trip off every request through here.
  const [profileQuery, limited] = await Promise.all([
    supabase.from('profiles').select('role').eq('id', user.id).single(),
    applyRateLimit(request, progressLimiter, user.id),
  ]);
  const profile = profileQuery.data as { role: UserRole } | null;
  if (profile?.role !== 'student') {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  if (limited) return { error: limited };

  return { error: null, supabase, user };
}

function serviceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.'
    );
  }
  return untypedFrom(
    createClient<Database>(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  );
}

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ chapterId: string }> }
) {
  const params = ParamsSchema.safeParse(await props.params);
  if (!params.success) {
    return NextResponse.json({ error: 'Invalid chapter id' }, { status: 400 });
  }

  const auth = await authenticate(request);
  if (auth.error) return auth.error;

  // Read through the user-scoped client so the table's own-row RLS
  // policy is what limits this to the caller's row.
  const { data, error } = await untypedFrom(auth.supabase)
    .from('chapter_quiz_progress')
    .select('answers, question_ids, current_question_index, total_questions, updated_at')
    .eq('student_id', auth.user.id)
    .eq('chapter_id', params.data.chapterId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: publicDbError(error) }, { status: 500, headers: NO_STORE });
  }
  const row = data as ProgressRow | null;
  if (!row) {
    return NextResponse.json({ progress: null }, { headers: NO_STORE });
  }

  // The quiz no longer carries answers, so resuming needs the feedback for
  // the questions already answered. Only reveals that were already recorded
  // come back: this must NOT record new ones, or anyone could PUT a guess for
  // every question and read the whole key back from here.
  const answers = row.answers ?? {};
  const answeredIds = Object.keys(answers).map(Number).filter(Number.isInteger);
  const { reveals, error: revealError } = await gatedReveals(
    serviceRoleClient(),
    auth.user.id,
    answeredIds
  );
  if (revealError) {
    return NextResponse.json({ error: revealError }, { status: 500, headers: NO_STORE });
  }

  return NextResponse.json(
    {
      progress: {
        answers,
        currentQuestionIndex: row.current_question_index,
        questionIds: row.question_ids,
        totalQuestions: row.total_questions,
        updatedAt: row.updated_at,
        reveals: revealsToJson(reveals),
      },
    },
    { headers: NO_STORE }
  );
}

export async function PUT(
  request: NextRequest,
  props: { params: Promise<{ chapterId: string }> }
) {
  const params = ParamsSchema.safeParse(await props.params);
  if (!params.success) {
    return NextResponse.json({ error: 'Invalid chapter id' }, { status: 400 });
  }
  const chapterId = params.data.chapterId;

  const auth = await authenticate(request);
  if (auth.error) return auth.error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = PutBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid payload', issues: parsed.error.issues },
      { status: 400 }
    );
  }
  const { answers, currentQuestionIndex, questionIds } = parsed.data;

  const result = await saveChapterProgress(serviceRoleClient(), auth.user.id, chapterId, {
    answers,
    currentQuestionIndex,
    questionIds,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  if (!result.saved) {
    return NextResponse.json(
      { saved: false, answered: 0, total: result.total },
      { headers: NO_STORE }
    );
  }
  return NextResponse.json(
    {
      saved: true,
      answered: result.answered,
      total: result.total,
      xpAwarded: result.xpAwarded,
    },
    { headers: NO_STORE }
  );
}

export async function DELETE(
  request: NextRequest,
  props: { params: Promise<{ chapterId: string }> }
) {
  const params = ParamsSchema.safeParse(await props.params);
  if (!params.success) {
    return NextResponse.json({ error: 'Invalid chapter id' }, { status: 400 });
  }

  const auth = await authenticate(request);
  if (auth.error) return auth.error;

  const del = await serviceRoleClient()
    .from('chapter_quiz_progress')
    .delete()
    .eq('student_id', auth.user.id)
    .eq('chapter_id', params.data.chapterId);
  if (del.error) {
    return NextResponse.json({ error: publicDbError(del.error) }, { status: 500 });
  }
  return NextResponse.json({ deleted: true }, { headers: NO_STORE });
}
