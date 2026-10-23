import { NextRequest, NextResponse } from 'next/server';
import { publicDbError } from '@/lib/api-error';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { createRouteHandlerClient, untypedFrom } from '@/lib/supabase-server';
import type { Database, UserRole } from '@/lib/supabase';
import { applyRateLimit } from '@/lib/apply-rate-limit';
import { reportLimiter } from '@/lib/rate-limit';
import { FlagBodySchema } from '@/lib/question-flags';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * /api/student/questions/[questionId]/flag
 *
 * "Report a question to the admins" from the chapter quiz.
 *
 *   GET  -> { flagged: boolean } — has THIS student already reported
 *           this question? Drives the Report button's "Reported" state.
 *   POST -> files the report. One report per (student, question): a
 *           repeat is a 409 { error: 'already_reported' }, which the UI
 *           treats as success (the admins have it either way).
 *
 * Table: question_flags (007), admin columns/policies in
 * 033_question_flag_admin.sql. Everything here goes through the
 * request-scoped client, so RLS is the enforcement:
 *   - INSERT only as yourself (flags_student_insert),
 *   - SELECT only your own rows (flags_student_read_own),
 *   - questions are visible only when published (questions_read_published),
 *     which is what makes "report a draft/archived question" a 404.
 * A trigger keeps questions.flag_count in step, which is what the admin
 * dashboard's Review Queue / Overview read.
 */

const ParamsSchema = z.object({
  questionId: z.coerce.number().int().positive(),
});

const NO_STORE = { 'Cache-Control': 'no-store' } as const;

type RouteSupabase = Awaited<ReturnType<typeof createRouteHandlerClient<Database>>>;

type AuthResult =
  | { error: NextResponse }
  | { error: null; supabase: RouteSupabase; user: { id: string } };

async function authenticate(): Promise<AuthResult> {
  const supabase = await createRouteHandlerClient<Database>({ cookies });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const profileQuery = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  const profile = profileQuery.data as { role: UserRole } | null;
  if (profile?.role !== 'student') {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  return { error: null, supabase, user };
}

export async function GET(
  _request: NextRequest,
  props: { params: Promise<{ questionId: string }> }
) {
  const params = ParamsSchema.safeParse(await props.params);
  if (!params.success) {
    return NextResponse.json({ error: 'Invalid question id' }, { status: 400 });
  }

  const auth = await authenticate();
  if (auth.error) return auth.error;

  const { data, error } = await untypedFrom(auth.supabase)
    .from('question_flags')
    .select('id')
    .eq('question_id', params.data.questionId)
    .eq('student_id', auth.user.id)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: publicDbError(error) }, { status: 500, headers: NO_STORE });
  }

  return NextResponse.json({ flagged: data !== null }, { headers: NO_STORE });
}

export async function POST(
  request: NextRequest,
  props: { params: Promise<{ questionId: string }> }
) {
  const params = ParamsSchema.safeParse(await props.params);
  if (!params.success) {
    return NextResponse.json({ error: 'Invalid question id' }, { status: 400 });
  }
  const questionId = params.data.questionId;

  const auth = await authenticate();
  if (auth.error) return auth.error;

  // Rate-limit only the write: the GET status check fires once per
  // question the student views and must never eat the report budget.
  const limited = await applyRateLimit(request, reportLimiter, auth.user.id);
  if (limited) return limited;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = FlagBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid payload', issues: parsed.error.issues },
      { status: 400 }
    );
  }
  const { reason, detail } = parsed.data;

  const client = untypedFrom(auth.supabase);

  // RLS only exposes published questions to a student, so a missing row
  // means "doesn't exist or isn't live" — either way not reportable.
  const questionRes = await client
    .from('questions')
    .select('id')
    .eq('id', questionId)
    .maybeSingle();
  if (questionRes.error) {
    return NextResponse.json({ error: publicDbError(questionRes.error) }, { status: 500 });
  }
  if (!questionRes.data) {
    return NextResponse.json({ error: 'Question not found' }, { status: 404 });
  }

  const insertRes = await client.from('question_flags').insert({
    question_id: questionId,
    student_id: auth.user.id,
    reason,
    detail: detail && detail.length > 0 ? detail : null,
  });
  if (insertRes.error) {
    // 23505 = unique_violation on (question_id, student_id).
    if (insertRes.error.code === '23505') {
      return NextResponse.json({ error: 'already_reported' }, { status: 409 });
    }
    return NextResponse.json({ error: publicDbError(insertRes.error) }, { status: 500 });
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
