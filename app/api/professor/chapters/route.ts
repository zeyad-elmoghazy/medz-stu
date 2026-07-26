import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@/lib/supabase-server';
import { z } from 'zod';
import type { Database } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CreateChapterSchema = z.object({
  moduleCode: z.string().min(1).max(16),
  name: z.string().min(2).max(120),
});

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 80);
}

/**
 * POST /api/professor/chapters
 * Body: { moduleCode, name }
 *
 * Only the module's assigned professor (or admin) can add a
 * chapter — enforced by the modules RLS on the SELECT and the
 * chapters RLS on the INSERT.
 */
export async function POST(request: Request) {
  const supabase = await createRouteHandlerClient<Database>({ cookies });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = CreateChapterSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { moduleCode, name } = parsed.data;
  const slug = slugify(name);

  // Compute next ordinal within the module.
  const ordinalRes = await (supabase as unknown as {
    from: (t: string) => {
      select: (c: string, o?: unknown) => {
        eq: (
          col: string,
          val: string
        ) => Promise<{ count: number | null; error: { message: string } | null }>;
      };
    };
  })
    .from('chapters')
    .select('id', { count: 'exact', head: true })
    .eq('module_code', moduleCode);

  const nextOrdinal = (ordinalRes.count ?? 0) + 1;

  const insertRes = await (supabase as unknown as {
    from: (t: string) => {
      insert: (row: Record<string, unknown>) => {
        select: (c: string) => {
          single: () => Promise<{
            data: Record<string, unknown> | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
  })
    .from('chapters')
    .insert({
      module_code: moduleCode,
      slug,
      name,
      ordinal: nextOrdinal,
    })
    .select('id, module_code, slug, name, ordinal')
    .single();

  if (insertRes.error) {
    return NextResponse.json(
      { error: insertRes.error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ chapter: insertRes.data }, { status: 201 });
}
