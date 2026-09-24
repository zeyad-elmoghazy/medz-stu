import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient, untypedFrom } from '@/lib/supabase-server';
import type { Database } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/student/bookmarks?questionId=N
 * GET /api/student/bookmarks              (list mode — no questionId)
 *
 * With `questionId`: whether the signed-in student has bookmarked
 * that question. Without it: every bookmark the student has saved,
 * joined to its question/chapter for display on /student/bookmarks
 * — bookmarks.question_id has no FK to questions.id (see
 * supabase/migrations/003_student_personalization.sql), so this is
 * two manual batch lookups rather than a PostgREST embed, same
 * approach as lib/server/chapter-mistakes.ts.
 *
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

  const client = untypedFrom(supabase);
  const questionIdParam = request.nextUrl.searchParams.get('questionId');

  if (questionIdParam === null) {
    const { data: rows } = await client
      .from('bookmarks')
      .select('id, question_id, created_at')
      .eq('student_id', user.id)
      .order('created_at', { ascending: false });

    const bookmarkRows =
      (rows as { id: string; question_id: number; created_at: string }[] | null) ?? [];
    if (bookmarkRows.length === 0) {
      return NextResponse.json({ bookmarks: [] });
    }

    const questionIds = bookmarkRows.map((b) => b.question_id);
    const { data: questionRows } = await client
      .from('questions')
      .select('id, question, topic, chapter_id')
      .in('id', questionIds);
    const questionById = new Map(
      (
        (questionRows as
          | { id: number; question: string; topic: string; chapter_id: string | null }[]
          | null) ?? []
      ).map((q) => [q.id, q])
    );

    const chapterIds = Array.from(
      new Set(
        Array.from(questionById.values())
          .map((q) => q.chapter_id)
          .filter((id): id is string => !!id)
      )
    );
    const chapterById = new Map<string, { name: string; module_code: string }>();
    if (chapterIds.length > 0) {
      const { data: chapterRows } = await client
        .from('chapters')
        .select('id, name, module_code')
        .in('id', chapterIds);
      for (const c of (chapterRows as { id: string; name: string; module_code: string }[] | null) ??
        []) {
        chapterById.set(c.id, c);
      }
    }

    const bookmarks = bookmarkRows.map((b) => {
      const q = questionById.get(b.question_id);
      const chapter = q?.chapter_id ? chapterById.get(q.chapter_id) : undefined;
      return {
        id: b.id,
        questionId: b.question_id,
        question: q?.question ?? '(question no longer available)',
        topic: q?.topic ?? '',
        chapterName: chapter?.name ?? null,
        moduleCode: chapter?.module_code ?? null,
        createdAt: b.created_at,
      };
    });

    return NextResponse.json({ bookmarks });
  }

  const questionId = Number(questionIdParam);
  if (!Number.isInteger(questionId)) {
    return NextResponse.json({ error: 'Invalid questionId' }, { status: 400 });
  }

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
