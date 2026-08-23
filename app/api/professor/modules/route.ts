import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@/lib/supabase-server';
import type { Database } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ModuleRow = {
  code: string;
  subject_id: string;
  name: string;
  year_num: string;
  year_label: string;
  is_active: boolean;
};

type ChapterRow = {
  id: string;
  module_code: string;
  subject_id: string;
  slug: string;
  name: string;
  ordinal: number;
  question_count: number;
  published_count: number;
  flagged_count: number;
};

/**
 * GET /api/professor/modules
 *
 * Returns all modules + their chapters, with counters. Public-
 * readable (matches the RLS on modules/chapters — every signed
 * in user can see the catalog).
 *
 * Pre-015 this route predates chapters.subject_id: a module had
 * exactly one subject, so joining chapters by module_code alone
 * was correct. Post-015 (module_subjects M:N), a module can carry
 * several subjects' chapters — joining by module_code alone
 * silently flattens all of them together under one module. This
 * route's only real callers are the static Histology pages
 * (data/histology-catalog.ts + student/exam), which have only ever
 * wanted Histology's chapters, so the fix scopes the chapters join
 * to (module_code, subject_id) with subject_id resolved to
 * Histology's row — matching the composite key used everywhere
 * else in the post-pivot model — rather than adding a new query
 * param this route's existing callers don't send.
 */
export async function GET() {
  const supabase = await createRouteHandlerClient<Database>({ cookies });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const untyped = supabase as unknown as {
    from: (t: string) => {
      select: (c: string) => {
        eq: (c: string, v: string) => {
          single: () => Promise<{ data: { id: string } | null; error: { message: string } | null }>;
        };
        order: (
          c: string,
          o: { ascending: boolean }
        ) => Promise<{ data: unknown[] | null; error: { message: string } | null }>;
      };
    };
  };

  const histologyRes = await untyped
    .from('subjects')
    .select('id')
    .eq('slug', 'histology')
    .single();

  if (histologyRes.error || !histologyRes.data) {
    return NextResponse.json({ error: 'Histology subject not found' }, { status: 500 });
  }
  const histologySubjectId = histologyRes.data.id;

  const [modulesRes, chaptersRes] = await Promise.all([
    untyped
      .from('modules')
      .select('code, subject_id, name, year_num, year_label, is_active')
      .order('code', { ascending: true }) as Promise<{ data: ModuleRow[] | null; error: { message: string } | null }>,
    untyped
      .from('chapters')
      .select(
        'id, module_code, subject_id, slug, name, ordinal, question_count, published_count, flagged_count'
      )
      .order('ordinal', { ascending: true }) as Promise<{ data: ChapterRow[] | null; error: { message: string } | null }>,
  ]);

  if (modulesRes.error) {
    return NextResponse.json({ error: modulesRes.error.message }, { status: 500 });
  }
  if (chaptersRes.error) {
    return NextResponse.json({ error: chaptersRes.error.message }, { status: 500 });
  }

  const modules = modulesRes.data ?? [];
  const chapters = chaptersRes.data ?? [];

  const withChapters = modules.map((m) => ({
    ...m,
    chapters: chapters
      .filter((c) => c.module_code === m.code && c.subject_id === histologySubjectId)
      .map((c) => ({
        id: c.id,
        slug: c.slug,
        name: c.name,
        ordinal: c.ordinal,
        question_count: c.question_count,
        published_count: c.published_count,
        flagged_count: c.flagged_count,
      })),
  }));

  return NextResponse.json(
    { modules: withChapters },
    {
      headers: { 'Cache-Control': 'private, max-age=15' },
    }
  );
}
