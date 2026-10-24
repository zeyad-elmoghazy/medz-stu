import { NextRequest, NextResponse } from 'next/server';
import { publicDbError } from '@/lib/api-error';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { createRouteHandlerClient, untypedFrom } from '@/lib/supabase-server';
import type { Database } from '@/lib/supabase';
import type { ExamSubjectOption } from '@/lib/custom-exam-rules';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const QuerySchema = z.object({ module: z.string().min(1).max(32) });

/**
 * GET /api/student/custom-exam/catalogue?module=205
 *
 * Everything the Custom Exam builder needs for ONE module in a single
 * call: its subjects (via module_subjects) and, under each, its chapters
 * with their published-question counts. The catalogue routes return one
 * subject's chapters at a time and don't expose subject ids, which the
 * exam creation request is keyed on.
 *
 * The module LIST (including modules with no published questions, shown
 * as "Coming soon") comes from the existing
 * /api/student/catalogue/modules-by-year route.
 *
 * Read-only curriculum structure: any signed-in user, same as the
 * catalogue routes. Counts come from chapters.published_count (kept live
 * by the update_chapter_counts trigger); the create route re-counts the
 * real questions before drawing, so a stale number can never produce an
 * oversized exam.
 */
export async function GET(request: NextRequest) {
  const supabase = await createRouteHandlerClient<Database>({ cookies });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const parsed = QuerySchema.safeParse({ module: request.nextUrl.searchParams.get('module') });
  if (!parsed.success) {
    return NextResponse.json({ error: 'module query param is required' }, { status: 400 });
  }
  const code = parsed.data.module;

  const client = untypedFrom(supabase);
  const [moduleRes, moduleSubjectsRes, chaptersRes] = await Promise.all([
    client.from('modules').select('code, name').eq('code', code).maybeSingle(),
    client
      .from('module_subjects')
      .select('subject_id, subjects(id, slug, name)')
      .eq('module_code', code),
    client
      .from('chapters')
      .select('id, name, ordinal, subject_id, published_count')
      .eq('module_code', code)
      .order('ordinal', { ascending: true }),
  ]);

  if (moduleRes.error) {
    return NextResponse.json({ error: publicDbError(moduleRes.error) }, { status: 500 });
  }
  if (!moduleRes.data) {
    return NextResponse.json({ error: 'Module not found' }, { status: 404 });
  }
  if (moduleSubjectsRes.error) {
    return NextResponse.json({ error: publicDbError(moduleSubjectsRes.error) }, { status: 500 });
  }
  if (chaptersRes.error) {
    return NextResponse.json({ error: publicDbError(chaptersRes.error) }, { status: 500 });
  }

  type SubjectRef = { id: string; slug: string; name: string };
  type ModuleSubjectRow = { subject_id: string; subjects: SubjectRef | SubjectRef[] | null };
  type ChapterRow = {
    id: string;
    name: string;
    ordinal: number;
    subject_id: string;
    published_count: number;
  };

  const chaptersBySubject = new Map<string, ExamSubjectOption['chapters']>();
  for (const c of (chaptersRes.data ?? []) as ChapterRow[]) {
    const list = chaptersBySubject.get(c.subject_id) ?? [];
    list.push({
      id: c.id,
      name: c.name,
      ordinal: c.ordinal,
      publishedCount: Math.max(0, Number(c.published_count) || 0),
    });
    chaptersBySubject.set(c.subject_id, list);
  }

  const subjects: ExamSubjectOption[] = [];
  for (const row of (moduleSubjectsRes.data ?? []) as ModuleSubjectRow[]) {
    const s = Array.isArray(row.subjects) ? row.subjects[0] : row.subjects;
    if (!s) continue;
    const chapters = chaptersBySubject.get(s.id) ?? [];
    subjects.push({
      id: s.id,
      slug: s.slug,
      name: s.name,
      publishedCount: chapters.reduce((sum, c) => sum + c.publishedCount, 0),
      chapters,
    });
  }
  subjects.sort((a, b) => a.name.localeCompare(b.name));

  return NextResponse.json(
    {
      moduleCode: code,
      moduleName: (moduleRes.data as { name: string }).name,
      subjects,
    },
    { headers: { 'Cache-Control': 'private, max-age=30' } }
  );
}
