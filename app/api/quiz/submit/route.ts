import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@/lib/supabase-server';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { isDemoMode, type Database, type UserRole } from '@/lib/supabase';
import { SUBJECTS_CONFIG } from '@/lib/dashboard-data';
import { histologyQuestions, type HistologyQuestion, type Choice } from '@/data/histology-questions';
import { applyRateLimit } from '@/lib/apply-rate-limit';
import { quizLimiter } from '@/lib/rate-limit';
import { invalidateCache } from '@/lib/cache';
import { CACHE_KEYS } from '@/lib/redis';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ============== Zod schema ==============
// Subject IDs come from SUBJECTS_CONFIG so adding a new block in
// the config automatically widens what this endpoint accepts.
const SUBJECT_IDS = SUBJECTS_CONFIG.map((s) => s.id) as [string, ...string[]];

const SubmitBodySchema = z.object({
  subjectId: z.enum(SUBJECT_IDS),
  answers: z
    .record(z.string(), z.string())
    .refine((o) => Object.keys(o).length > 0, {
      message: 'answers must contain at least one entry',
    }),
  // Ids the client actually rendered in this session. When present,
  // scoring is restricted to just these — so a challenge of 11
  // questions returns "X / 11" even if the bank has more rows.
  questionIds: z.array(z.number().int()).optional(),
  startedAt: z
    .string()
    .refine((s) => !Number.isNaN(new Date(s).getTime()), {
      message: 'startedAt must be a valid ISO date string',
    }),
});

// ============== POST ==============
/**
 * POST /api/quiz/submit
 *
 * End-of-quiz handler. Trusts NO client-supplied score —
 * recomputes everything from the canonical question bank on the
 * server, then writes:
 *   1. one row in `quiz_sessions` (the canonical attempt record)
 *   2. one row in `daily_streaks` (or increments today's count)
 *   3. cache invalidations for the student's analytics and the
 *      subject leaderboard
 * and returns the per-question results so the results page can
 * paint without a follow-up fetch.
 */
export async function POST(request: NextRequest) {
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

  // 2) Rate limit by user id — the IP fallback would collectively
  // throttle every student behind one university NAT.
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
  const { subjectId, answers, startedAt, questionIds } = parsed.data;

  // 4) Score server-side from the canonical bank (Supabase in
  // real mode, bundled TS module in demo mode). Answers keys must
  // match the ids we send from /api/questions/[subjectId], which
  // is why both endpoints share the subject_bundle_id namespace.
  const allQuestions = await getQuestionsForSubject(subjectId);
  if (allQuestions.length === 0) {
    return NextResponse.json(
      { error: `Subject "${subjectId}" has no published questions yet.` },
      { status: 400 }
    );
  }

  // If the client told us which questions were in this session,
  // score only those — the bank may hold more rows than the student
  // actually saw (chapter filters, bundled challenges, etc.).
  const questions = questionIds && questionIds.length > 0
    ? allQuestions.filter((q) => questionIds.includes(q.id))
    : allQuestions;

  const results = questions.map((q) => ({
    questionId: q.id,
    chosen: answers[String(q.id)] ?? null,
    correct: q.correctAnswer,
    isCorrect: answers[String(q.id)] === q.correctAnswer,
  }));

  const score = results.filter((r) => r.isCorrect).length;
  const total = questions.length;
  const accuracy = Number(((score / total) * 100).toFixed(2));

  // 5) Persist with the service-role client (bypasses RLS so the
  // worker-side path can also write here later without acting on
  // behalf of the student session).
  const service = serviceRoleClient() as unknown as ServiceClient;

  const insertRes = await service
    .from('quiz_sessions')
    .insert({
      student_id: user.id,
      subject_id: subjectId,
      answers,
      score,
      total_questions: total,
      accuracy,
      // Persist the startedAt as completed_at minus duration?
      // The schema only stores completed_at; we leave that to
      // the DEFAULT NOW(). startedAt is kept in the payload for
      // future use (timing analysis, anti-cheat) but not stored
      // until the schema adds the column.
    })
    .select('id')
    .single();

  if (insertRes.error || !insertRes.data) {
    return NextResponse.json(
      { error: insertRes.error?.message ?? 'Failed to record session.' },
      { status: 500 }
    );
  }

  const sessionId = insertRes.data.id;

  // 6) Update the daily_streaks row for today.
  // Supabase JS can't express SET col = col + 1 in upsert, so we
  // do a scoped select-then-update. A single student can't race
  // themselves through the UI fast enough for this to clash.
  await bumpDailyStreak(service, user.id);

  // 7) Cache invalidation — best-effort. A stale cache is better
  // than a failed submission, so swallow errors here.
  try {
    await invalidateCache(
      CACHE_KEYS.studentAnalytics(user.id),
      CACHE_KEYS.leaderboard(subjectId)
    );
  } catch {
    // non-fatal
  }

  // 8) Response with full per-question results.
  // `startedAt` is echoed back so the results page can show
  // session duration without another fetch.
  return NextResponse.json({
    sessionId,
    score,
    total,
    accuracy,
    startedAt,
    results,
  });
}

// ============== Service-role client typing ==============
// `@supabase/auth-helpers-nextjs@0.8` collapses the Database
// generic to never when chaining; the @supabase/supabase-js
// client used here inherits the same widening. The shape below
// is the minimum surface this route needs.
type ErrorShape = { message: string } | null;

type ServiceClient = {
  from: (table: string) => {
    insert: (row: Record<string, unknown>) => {
      select: (cols: string) => {
        single: () => Promise<{
          data: { id: string } | null;
          error: ErrorShape;
        }>;
      };
    } & Promise<{ error: ErrorShape }>;
    select: (cols: string) => {
      eq: (col: string, val: unknown) => {
        eq: (col: string, val: unknown) => {
          maybeSingle: () => Promise<{
            data: { challenges_completed: number } | null;
            error: ErrorShape;
          }>;
        };
      };
    };
    update: (patch: Record<string, unknown>) => {
      eq: (col: string, val: unknown) => {
        eq: (col: string, val: unknown) => Promise<{ error: ErrorShape }>;
      };
    };
  };
};

// ============== Helpers ==============
type QuestionRow = {
  subject_bundle_id: number;
  question: string;
  choices: Choice[];
  correct_answer: string;
  explanation: string;
  choice_rationales: Record<string, string> | null;
  reference: string;
  topic: string;
};

async function getQuestionsForSubject(subjectId: string): Promise<HistologyQuestion[]> {
  if (isDemoMode()) {
    return subjectId === 'histology' ? histologyQuestions : [];
  }

  // Fetch the canonical bank with the service-role client so the
  // scoring path stays authoritative even if RLS is retightened
  // later (the SELECT policy on `questions` currently permits any
  // authenticated user, but making scoring depend on that would
  // couple two independent things).
  const service = serviceRoleClient() as unknown as {
    from: (table: string) => {
      select: (cols: string) => {
        eq: (col: string, val: unknown) => {
          order: (
            col: string,
            opts: { ascending: boolean }
          ) => Promise<{ data: QuestionRow[] | null; error: { message: string } | null }>;
        };
      };
    };
  };

  const { data, error } = await service
    .from('questions')
    .select(
      'subject_bundle_id, question, choices, correct_answer, explanation, choice_rationales, reference, topic'
    )
    .eq('subject_id', subjectId)
    .order('subject_bundle_id', { ascending: true });

  if (error) throw new Error(error.message);

  return (data ?? []).map(
    (r): HistologyQuestion => ({
      id: r.subject_bundle_id,
      question: r.question,
      choices: r.choices,
      correctAnswer: r.correct_answer,
      explanation: r.explanation,
      choiceRationales: r.choice_rationales ?? undefined,
      reference: r.reference,
      topic: r.topic,
    })
  );
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

async function bumpDailyStreak(service: ServiceClient, studentId: string) {
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
