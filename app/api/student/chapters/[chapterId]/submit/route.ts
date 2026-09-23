import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { createRouteHandlerClient, untypedFrom } from '@/lib/supabase-server';
import type { Database, UserRole } from '@/lib/supabase';
import { applyRateLimit } from '@/lib/apply-rate-limit';
import { quizLimiter } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Chapter id comes from the route param, not the body — otherwise
// identical in shape to /api/quiz/submit's SubmitBodySchema.
const SubmitBodySchema = z.object({
  answers: z
    .record(z.string(), z.string())
    .refine((o) => Object.keys(o).length > 0, {
      message: 'answers must contain at least one entry',
    }),
  // Ids the client actually rendered in this session — scoring is
  // restricted to just these when present, same reasoning as the
  // static quiz's submit route.
  questionIds: z.array(z.number().int()).optional(),
  startedAt: z
    .string()
    .refine((s) => !Number.isNaN(new Date(s).getTime()), {
      message: 'startedAt must be a valid ISO date string',
    }),
});

type UntypedClient = ReturnType<typeof untypedFrom>;

/**
 * POST /api/student/chapters/[chapterId]/submit
 *
 * Chapter-scoped counterpart to /api/quiz/submit (that route is
 * left untouched — this is a parallel path, not a replacement).
 * Same trust-nothing-from-the-client approach: recomputes the score
 * server-side from the canonical published question bank, then
 * writes one row to `chapter_quiz_sessions` (see
 * 025_chapter_quiz_sessions.sql for why this isn't `quiz_sessions`)
 * and bumps the shared daily-streak counter. No subject-scoped
 * leaderboard/analytics cache to invalidate here — chapters don't
 * have one.
 */
export async function POST(
  request: NextRequest,
  props: { params: Promise<{ chapterId: string }> }
) {
  const { chapterId } = await props.params;
  const supabase = await createRouteHandlerClient<Database>({ cookies });

  // 1) Verify session.
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

  // 2) Rate limit by user id — same limiter/budget as the static
  // quiz's submit route (30/hour comfortably covers real usage).
  const limited = await applyRateLimit(request, quizLimiter, user.id);
  if (limited) return limited;

  // 3) Validate input with Zod.
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
  const { answers, startedAt, questionIds } = parsed.data;

  // 4) Score server-side from the canonical bank. Service-role
  // client — same reasoning as the static quiz's submit route: the
  // scoring path stays authoritative even if the `questions` SELECT
  // policy is retightened later.
  const service = untypedFrom(serviceRoleClient());

  const chapterRes = await service
    .from('chapters')
    .select('id')
    .eq('id', chapterId)
    .single();
  if (chapterRes.error || !chapterRes.data) {
    return NextResponse.json({ error: 'Chapter not found' }, { status: 404 });
  }

  const questionsRes = await service
    .from('questions')
    .select('id, correct_answer')
    .eq('chapter_id', chapterId)
    .eq('status', 'published')
    .order('id', { ascending: true });

  if (questionsRes.error) {
    return NextResponse.json({ error: questionsRes.error.message }, { status: 500 });
  }

  type QuestionRow = { id: number; correct_answer: string };
  const allQuestions = (questionsRes.data ?? []) as QuestionRow[];
  if (allQuestions.length === 0) {
    return NextResponse.json(
      { error: 'This chapter has no published questions yet.' },
      { status: 400 }
    );
  }

  // If the client told us which questions were in this session,
  // score only those — same reasoning as the static quiz route.
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

  // 5) Persist the attempt.
  const insertRes = await service
    .from('chapter_quiz_sessions')
    .insert({
      student_id: user.id,
      chapter_id: chapterId,
      answers,
      score,
      total_questions: total,
      accuracy,
    })
    .select('id')
    .single();

  if (insertRes.error || !insertRes.data) {
    return NextResponse.json(
      { error: insertRes.error?.message ?? 'Failed to record session.' },
      { status: 500 }
    );
  }

  const sessionId = insertRes.data.id as string;

  // 6) Bump today's daily-streak counter — shared, subject-agnostic.
  await bumpDailyStreak(service, user.id);

  // 7) Response with full per-question results, same shape as
  // /api/quiz/submit so the results page can render without a
  // follow-up fetch.
  return NextResponse.json({
    sessionId,
    score,
    total,
    accuracy,
    startedAt,
    results,
  });
}

function serviceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.'
    );
  }
  return createClient<Database>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function bumpDailyStreak(service: UntypedClient, studentId: string) {
  const today = todayISODate();
  const { data: existingRow } = await service
    .from('daily_streaks')
    .select('challenges_completed')
    .eq('student_id', studentId)
    .eq('streak_date', today)
    .maybeSingle();

  if (existingRow) {
    await service
      .from('daily_streaks')
      .update({
        challenges_completed: (existingRow.challenges_completed ?? 0) + 1,
      })
      .eq('student_id', studentId)
      .eq('streak_date', today);
    return;
  }

  await service.from('daily_streaks').insert({
    student_id: studentId,
    streak_date: today,
    challenges_completed: 1,
  });
}

function todayISODate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${day}`;
}
