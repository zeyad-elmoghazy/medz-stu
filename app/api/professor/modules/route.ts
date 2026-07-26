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
 */
export async function GET() {
  const supabase = await createRouteHandlerClient<Database>({ cookies });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const [modulesRes, chaptersRes] = await Promise.all([
    (supabase as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          order: (
            c: string,
            o: { ascending: boolean }
          ) => Promise<{ data: ModuleRow[] | null; error: { message: string } | null }>;
        };
      };
    })
      .from('modules')
      .select('code, subject_id, name, year_num, year_label, is_active')
      .order('code', { ascending: true }),
    (supabase as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          order: (
            c: string,
            o: { ascending: boolean }
          ) => Promise<{ data: ChapterRow[] | null; error: { message: string } | null }>;
        };
      };
    })
      .from('chapters')
      .select(
        'id, module_code, slug, name, ordinal, question_count, published_count, flagged_count'
      )
      .order('ordinal', { ascending: true }),
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
      .filter((c) => c.module_code === m.code)
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
