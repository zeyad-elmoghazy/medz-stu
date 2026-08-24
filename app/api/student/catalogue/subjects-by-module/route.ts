import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient, untypedFrom } from '@/lib/supabase-server';
import type { Database } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/student/catalogue/subjects-by-module?code=101
 *
 * The subjects assigned to one module (via module_subjects), each
 * with its chapter count and published-question count scoped to
 * THIS module specifically — the same subject can carry a different
 * chapter list in a different module, so these are never platform-
 * wide subject totals.
 *
 * Auth: any signed-in user, same pattern as modules-by-year.
 */
export async function GET(request: NextRequest) {
  const supabase = await createRouteHandlerClient<Database>({ cookies });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const code = request.nextUrl.searchParams.get('code');
  if (!code) {
    return NextResponse.json({ error: 'code query param is required' }, { status: 400 });
  }

  const client = untypedFrom(supabase);

  const [moduleRes, moduleSubjectsRes, chaptersRes] = await Promise.all([
    client.from('modules').select('code, name').eq('code', code).single(),
    client
      .from('module_subjects')
      .select('subject_id, subjects(id, slug, name)')
      .eq('module_code', code),
    client.from('chapters').select('subject_id, published_count').eq('module_code', code),
  ]);

  if (moduleRes.error) {
    return NextResponse.json({ error: 'Module not found' }, { status: 404 });
  }
  if (moduleSubjectsRes.error) {
    return NextResponse.json({ error: moduleSubjectsRes.error.message }, { status: 500 });
  }
  if (chaptersRes.error) {
    return NextResponse.json({ error: chaptersRes.error.message }, { status: 500 });
  }

  type ModuleSubjectRow = {
    subject_id: string;
    subjects: { id: string; slug: string; name: string } | { id: string; slug: string; name: string }[] | null;
  };
  type ChapterRow = { subject_id: string; published_count: number };

  const chapters = (chaptersRes.data ?? []) as ChapterRow[];
  const chapterCountBySubject = new Map<string, number>();
  const publishedCountBySubject = new Map<string, number>();
  for (const c of chapters) {
    chapterCountBySubject.set(c.subject_id, (chapterCountBySubject.get(c.subject_id) ?? 0) + 1);
    publishedCountBySubject.set(
      c.subject_id,
      (publishedCountBySubject.get(c.subject_id) ?? 0) + (Number(c.published_count) || 0)
    );
  }

  const subjects = ((moduleSubjectsRes.data ?? []) as ModuleSubjectRow[])
    .map((row) => {
      const s = Array.isArray(row.subjects) ? row.subjects[0] : row.subjects;
      if (!s) return null;
      return {
        slug: s.slug,
        name: s.name,
        chapterCount: chapterCountBySubject.get(s.id) ?? 0,
        publishedCount: publishedCountBySubject.get(s.id) ?? 0,
      };
    })
    .filter((s): s is NonNullable<typeof s> => s !== null)
    .sort((a, b) => a.name.localeCompare(b.name));

  const chapterTotal = chapters.length;
  const publishedTotal = chapters.reduce((sum, c) => sum + (Number(c.published_count) || 0), 0);

  return NextResponse.json(
    {
      moduleCode: code,
      moduleName: (moduleRes.data as { name: string }).name,
      chapterTotal,
      publishedTotal,
      subjects,
    },
    { headers: { 'Cache-Control': 'private, max-age=60' } }
  );
}
