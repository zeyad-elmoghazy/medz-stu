import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/require-admin';
import { untypedFrom } from '@/lib/supabase-server';
import { logActivity } from '@/lib/admin-activity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/content/chapters?moduleCode=&subjectId=
 *
 * Chapters for a (module, subject) pair — the actual scope a
 * chapter lives at. Both params required: chapters are never
 * listed at the subject level alone, since the same subject's
 * chapters differ per module.
 */
export async function GET(request: NextRequest) {
  const { supabase, error } = await requireAdmin();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const moduleCode = searchParams.get('moduleCode');
  const subjectId = searchParams.get('subjectId');
  if (!moduleCode || !subjectId) {
    return NextResponse.json({ error: 'moduleCode and subjectId query params are both required' }, { status: 400 });
  }

  const { data, error: dbError } = await untypedFrom(supabase)
    .from('chapters')
    .select('id, module_code, subject_id, slug, name, ordinal, question_count, published_count, flagged_count, default_book_id, default_page_start')
    .eq('module_code', moduleCode)
    .eq('subject_id', subjectId)
    .order('ordinal', { ascending: true });

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
  return NextResponse.json({ chapters: data ?? [] });
}

const CreateChapterSchema = z.object({
  moduleCode: z.string().min(1),
  subjectId: z.string().uuid(),
  name: z.string().min(1).max(200),
  ordinal: z.number().int().min(1).optional(),
});

export async function POST(request: NextRequest) {
  const { user, supabase, error } = await requireAdmin();
  if (error) return error;

  const body = await request.json().catch(() => null);
  const parsed = CreateChapterSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 });
  }
  const d = parsed.data;
  const slug = d.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

  let ordinal = d.ordinal;
  if (ordinal === undefined) {
    const maxRes = await untypedFrom(supabase)
      .from('chapters')
      .select('ordinal')
      .eq('module_code', d.moduleCode)
      .eq('subject_id', d.subjectId)
      .order('ordinal', { ascending: false })
      .limit(1);
    ordinal = ((maxRes.data as { ordinal: number }[] | null)?.[0]?.ordinal ?? 0) + 1;
  }

  const { data, error: dbError } = await untypedFrom(supabase)
    .from('chapters')
    .insert({ module_code: d.moduleCode, subject_id: d.subjectId, slug, name: d.name.trim(), ordinal })
    .select('id, module_code, subject_id, slug, name, ordinal')
    .single();

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  await logActivity(supabase, {
    actorId: user.id,
    action: 'chapter_created',
    entityType: 'chapter',
    entityId: (data as { id: string }).id,
    summary: `Created chapter "${d.name.trim()}" in Module ${d.moduleCode}`,
  });

  return NextResponse.json({ chapter: data }, { status: 201 });
}
