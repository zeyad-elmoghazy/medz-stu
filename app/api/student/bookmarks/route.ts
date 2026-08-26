import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient, untypedFrom } from '@/lib/supabase-server';
import type { Database } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/student/bookmarks?questionId=N
 *
 * Whether the signed-in student has bookmarked this question.
 * Same auth pattern as the chapter-questions route family
 * (if(!user)-only) — the actual scoping is RLS (students_own_
 * bookmarks: student_id = auth.uid()), enforced by using the
 * cookie-scoped client below, never a service-role client.
 */
export async function GET(request: NextRequest) {
  const supabase = await createRouteHandlerClient<Database>({ cookies });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const questionId = Number(request.nextUrl.searchParams.get('questionId'));
  if (!Number.isInteger(questionId)) {
    return NextResponse.json({ error: 'Invalid questionId' }, { status: 400 });
  }

  const client = untypedFrom(supabase);
  const { data } = await client
    .from('bookmarks')
    .select('id')
    .eq('student_id', user.id)
    .eq('question_id', questionId)
    .maybeSingle();

  return NextResponse.json({ bookmarked: !!data });
}

/**
 * POST /api/student/bookmarks  { questionId: number }
 *
 * subject_id is looked up server-side from the question row rather
 * than trusted from the client — it's a NOT NULL column on
 * bookmarks with no bearing on the auth boundary (RLS already
 * scopes every row to auth.uid()), but there's no reason to trust
 * client-supplied metadata when the real value is one query away.
 */
export async function POST(request: NextRequest) {
  const supabase = await createRouteHandlerClient<Database>({ cookies });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const questionId = Number(body?.questionId);
  if (!Number.isInteger(questionId)) {
    return NextResponse.json({ error: 'Invalid questionId' }, { status: 400 });
  }

  const client = untypedFrom(supabase);
  const { data: question, error: questionError } = await client
    .from('questions')
    .select('subject_id')
    .eq('id', questionId)
    .single();

  if (questionError || !question) {
    return NextResponse.json({ error: 'Question not found' }, { status: 404 });
  }

  const { error } = await client
    .from('bookmarks')
    .upsert(
      { student_id: user.id, question_id: questionId, subject_id: question.subject_id },
      { onConflict: 'student_id,question_id' }
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ bookmarked: true });
}

/**
 * DELETE /api/student/bookmarks?questionId=N
 */
export async function DELETE(request: NextRequest) {
  const supabase = await createRouteHandlerClient<Database>({ cookies });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const questionId = Number(request.nextUrl.searchParams.get('questionId'));
  if (!Number.isInteger(questionId)) {
    return NextResponse.json({ error: 'Invalid questionId' }, { status: 400 });
  }

  const client = untypedFrom(supabase);
  const { error } = await client
    .from('bookmarks')
    .delete()
    .eq('student_id', user.id)
    .eq('question_id', questionId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ bookmarked: false });
}
