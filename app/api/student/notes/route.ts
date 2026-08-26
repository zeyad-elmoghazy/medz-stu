import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient, untypedFrom } from '@/lib/supabase-server';
import type { Database } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/student/notes?questionId=N
 *
 * The signed-in student's note content for this question, or ''
 * if none exists yet. Same auth pattern as the rest of this route
 * family — RLS (students_own_notes: student_id = auth.uid()) does
 * the actual scoping via the cookie-bound client.
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
    .from('notes')
    .select('content')
    .eq('student_id', user.id)
    .eq('question_id', questionId)
    .maybeSingle();

  return NextResponse.json({ content: data?.content ?? '' });
}

/**
 * PUT /api/student/notes  { questionId: number, content: string }
 *
 * subject_id is looked up server-side from the question row, same
 * reasoning as the bookmarks route — not trusted from the client.
 */
export async function PUT(request: NextRequest) {
  const supabase = await createRouteHandlerClient<Database>({ cookies });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const questionId = Number(body?.questionId);
  const content = typeof body?.content === 'string' ? body.content : null;
  if (!Number.isInteger(questionId) || content === null) {
    return NextResponse.json({ error: 'Invalid questionId or content' }, { status: 400 });
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

  const { error } = await client.from('notes').upsert(
    {
      student_id: user.id,
      question_id: questionId,
      subject_id: question.subject_id,
      content,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'student_id,question_id' }
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ saved: true });
}
