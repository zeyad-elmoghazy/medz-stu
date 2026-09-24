import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient, untypedFrom } from '@/lib/supabase-server';
import type { Database } from '@/lib/supabase';
import { deriveChapterMistakes, fetchChapterQuizAttempts } from '@/lib/server/chapter-mistakes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/student/catalogue/chapters-by-subject?moduleCode=101&subjectSlug=histology
 *
 * Chapters scoped to one (module, subject) pair — the real scope a
 * chapter lives at (015_b2c_pivot_rebuild.sql). published_count is
 * read directly from the chapters column; it's kept live by the
 * on_question_change trigger (update_chapter_counts()) on every
 * question insert/update/delete, so this never counts questions
 * itself.
 *
 * Auth: any signed-in user, same pattern as the other catalogue
 * routes.
 */
export async function GET(request: NextRequest) {
  const supabase = await createRouteHandlerClient<Database>({ cookies });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const moduleCode = request.nextUrl.searchParams.get('moduleCode');
  const subjectSlug = request.nextUrl.searchParams.get('subjectSlug');
  if (!moduleCode || !subjectSlug) {
    return NextResponse.json(
      { error: 'moduleCode and subjectSlug query params are both required' },
      { status: 400 }
    );
  }

  const client = untypedFrom(supabase);

  const [moduleRes, subjectRes] = await Promise.all([
    client.from('modules').select('code, name').eq('code', moduleCode).single(),
    client.from('subjects').select('id, slug, name').eq('slug', subjectSlug).single(),
  ]);

  if (moduleRes.error) {
    return NextResponse.json({ error: 'Module not found' }, { status: 404 });
  }
  if (subjectRes.error) {
    return NextResponse.json({ error: 'Subject not found' }, { status: 404 });
  }

  const subjectId = (subjectRes.data as { id: string }).id;

  const chaptersRes = await client
    .from('chapters')
    .select('id, slug, name, ordinal, published_count, topic')
    .eq('module_code', moduleCode)
    .eq('subject_id', subjectId)
    .order('ordinal', { ascending: true });

  if (chaptersRes.error) {
    return NextResponse.json({ error: chaptersRes.error.message }, { status: 500 });
  }

  type ChapterRow = { id: string; slug: string; name: string; ordinal: number; published_count: number; topic: string | null };
  const chapters = (chaptersRes.data ?? []) as ChapterRow[];

  const chapterTotal = chapters.length;
  const publishedTotal = chapters.reduce((sum, c) => sum + (Number(c.published_count) || 0), 0);

  // Whether each chapter has ever been attempted (any quiz_sessions
  // row — real, DB-backed, unlike the client-only mistakes store),
  // and its current mistake pool via the shared helper also used by
  // /api/student/stats (lib/server/chapter-mistakes.ts) so the two
  // surfaces can never disagree.
  const chapterIds = chapters.map((c) => c.id);
  const attemptedChapterIds = new Set<string>();
  let mistakesByChapter = new Map<string, number[]>();

  if (chapterIds.length > 0) {
    const sessionsRes = await client
      .from('quiz_sessions')
      .select('chapter_id')
      .eq('student_id', user.id)
      .in('chapter_id', chapterIds);
    for (const row of (sessionsRes.data as { chapter_id: string }[] | null) ?? []) {
      attemptedChapterIds.add(row.chapter_id);
    }

    const attempts = await fetchChapterQuizAttempts(supabase, user.id, { chapterIds });
    mistakesByChapter = new Map(
      deriveChapterMistakes(attempts).map((cm) => [cm.chapterId, cm.questionIds])
    );
  }

  return NextResponse.json(
    {
      moduleCode,
      moduleName: (moduleRes.data as { name: string }).name,
      subjectSlug,
      subjectName: (subjectRes.data as { name: string }).name,
      chapterTotal,
      publishedTotal,
      chapters: chapters.map((c) => ({
        id: c.id,
        slug: c.slug,
        name: c.name,
        ordinal: c.ordinal,
        publishedCount: Number(c.published_count) || 0,
        attempted: attemptedChapterIds.has(c.id),
        mistakeQuestionIds: mistakesByChapter.get(c.id) ?? [],
      })),
    },
    { headers: { 'Cache-Control': 'private, max-age=30' } }
  );
}
