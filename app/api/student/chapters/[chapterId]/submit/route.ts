import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@/lib/supabase-server';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { Database, UserRole } from '@/lib/supabase';
import { applyRateLimit } from '@/lib/apply-rate-limit';
import { quizLimiter } from '@/lib/rate-limit';
import { invalidateCache } from '@/lib/cache';
import { CACHE_KEYS } from '@/lib/redis';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SubmitBodySchema = z.object({
  answers: z
    .record(z.string(), z.string())
    .refine((o) => Object.keys(o).length > 0, {
      message: 'answers must contain at least one entry',
    }),
  // Ids the client actually rendered in this session — when present,
  // scoring (and the returned per-question results) are restricted
  // to just these, same reasoning as /api/quiz/submit.
  questionIds: z.array(z.number().int()).optional(),
});

/**
 * POST /api/student/chapters/[chapterId]/submit
 *
 * XP-earning counterpart to the read-only
 * /api/student/chapters/[chapterId]/questions endpoint, for the
 * chapter-scoped practice quiz (app/(student)/student/quiz/chapter/
 * [chapterId]/page.tsx). That route is intentionally unproctored
 * (no fullscreen enforcement, no anti-cheat violation tracking —
 * see its own header comment), so this earns XP via the exact same
 * formula and DAILY CAP POOL as the proctored /api/quiz/submit path
 * (deliberate: the cap already bounds the benefit of an unproctored
 * attempt, so a second, separate cap isn't needed).
 *
 * Also inserts one row into `quiz_sessions` (chapter_id set — see
 * supabase/migrations/026_quiz_sessions_chapter_id.sql) so this,
 * the app's real/primary quiz flow, feeds the student Analytics
 * view's "Recent Challenges", "Accuracy Trend", and per-subject
 * numbers the same way the old proctored flow's /api/quiz/submit
 * does. That insert is best-effort (logged, non-fatal) since this
 * route's response doesn't depend on a session id the way
 * /api/quiz/submit's does. Also updates the running XP/stat
 * counters on `profiles` and the leaderboard — and enforces the
 * daily XP cap — atomically inside the `record_quiz_result` RPC
 * (see supabase/migrations/029_fix_record_quiz_result_race.sql;
 * the cap used to be computed here in the app layer as a separate
 * read-then-write step, which raced under concurrent submissions).
 * Also returns a per-question `results` breakdown (chosen/correct/
 * isCorrect) — the chapter quiz page's results screen renders
 * entirely from this response, the same way the proctored results
 * page renders from /api/quiz/submit's response.
 */
export async function POST(
  request: NextRequest,
  props: { params: Promise<{ chapterId: string }> }
) {
  const params = await props.params;
  const chapterId = params.chapterId;

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
  if (profile?.role !== 'student') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const limited = await applyRateLimit(request, quizLimiter, user.id);
  if (limited) return limited;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = SubmitBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid payload', issues: parsed.error.issues },
      { status: 400 }
    );
  }
  const { answers, questionIds } = parsed.data;

  const service = serviceRoleClient();

  // Never trust client-supplied correctness — recompute from the
  // canonical bank, same principle as /api/quiz/submit, even though
  // this chapter's GET endpoint already reveals correct answers to
  // the client (a pre-existing, separate design choice in that
  // route, not something this endpoint should compound by also
  // trusting a client-claimed score).
  const questionsRes = await service
    .from('questions')
    .select('id, correct_answer, subject_id')
    .eq('chapter_id', chapterId)
    .eq('status', 'published');

  if (questionsRes.error) {
    return NextResponse.json({ error: questionsRes.error.message }, { status: 500 });
  }
  const allQuestions =
    (questionsRes.data as { id: number; correct_answer: string; subject_id: string }[] | null) ?? [];
  if (allQuestions.length === 0) {
    return NextResponse.json({ error: 'Chapter has no published questions.' }, { status: 400 });
  }

  // If the client told us which questions were in this session
  // (e.g. a "Practice mistakes" subset), score only those.
  const questions =
    questionIds && questionIds.length > 0
      ? allQuestions.filter((q) => questionIds.includes(q.id))
      : allQuestions;
  if (questions.length === 0) {
    return NextResponse.json(
      { error: 'None of the submitted questionIds belong to this chapter.' },
      { status: 400 }
    );
  }

  const results = questions.map((q) => ({
    questionId: q.id,
    chosen: answers[String(q.id)] ?? null,
    correct: q.correct_answer,
    isCorrect: answers[String(q.id)] === q.correct_answer,
  }));

  const score = results.filter((r) => r.isCorrect).length;
  const total = questions.length;
  const accuracy = Number(((score / total) * 100).toFixed(2));

  // Best-effort: record this attempt in quiz_sessions so it feeds the
  // Analytics view (Recent Challenges / Accuracy Trend / per-subject
  // numbers). Non-fatal — a failed insert here shouldn't block XP/
  // streak credit or the results screen, same principle as the
  // record_quiz_result RPC error handling below.
  const sessionInsertRes = await service.from('quiz_sessions').insert({
    student_id: user.id,
    subject_id: questions[0].subject_id,
    chapter_id: chapterId,
    answers,
    score,
    total_questions: total,
    accuracy,
    violations_count: 0,
  });
  if (sessionInsertRes.error) {
    console.error('[chapters/submit] quiz_sessions insert failed:', sessionInsertRes.error.message);
  }

  const today = todayISODate();
  const rpcRes = await service.rpc('record_quiz_result', {
    p_student_id: user.id,
    p_correct_count: score,
    p_total_count: total,
    p_accuracy: accuracy,
    p_violations_count: 0,
    p_streak_date: today,
  });

  if (rpcRes.error) {
    console.error('[chapters/submit] record_quiz_result failed:', rpcRes.error.message);
  }
  const xpEarned = rpcRes.data?.[0]?.xp_earned ?? 0;

  try {
    await invalidateCache(CACHE_KEYS.leaderboardGlobal());
  } catch {
    // non-fatal
  }

  return NextResponse.json({ score, total, accuracy, xpEarned, results });
}

// ============== Service-role client typing ==============
// Same minimum-surface rationale as app/api/quiz/submit/route.ts.
type ErrorShape = { message: string } | null;

type ServiceClient = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, val: unknown) => {
        eq: (col: string, val: unknown) => Promise<{
          data: unknown;
          error: ErrorShape;
        }>;
      };
    };
    insert: (row: Record<string, unknown>) => Promise<{ error: ErrorShape }>;
  };
  rpc: (
    name: string,
    args: Record<string, unknown>
  ) => Promise<{
    data: { xp_earned: number; eligible_correct_count: number }[] | null;
    error: ErrorShape;
  }>;
};

function serviceRoleClient(): ServiceClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.'
    );
  }
  return createClient<Database>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  }) as unknown as ServiceClient;
}

function todayISODate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${day}`;
}
