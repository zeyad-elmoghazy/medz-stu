import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/require-admin';
import { untypedFrom } from '@/lib/supabase-server';
import { logActivity } from '@/lib/admin-activity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PatchChapterSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  ordinal: z.number().int().min(1).optional(),
  defaultBookId: z.string().uuid().nullable().optional(),
  defaultPageStart: z.number().int().min(1).nullable().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { user, supabase, error } = await requireAdmin();
  if (error) return error;

  const body = await request.json().catch(() => null);
  const parsed = PatchChapterSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 });
  }
  const d = parsed.data;
  const update: Record<string, unknown> = {};
  if (d.name !== undefined) update.name = d.name;
  if (d.ordinal !== undefined) update.ordinal = d.ordinal;
  if (d.defaultBookId !== undefined) update.default_book_id = d.defaultBookId;
  if (d.defaultPageStart !== undefined) update.default_page_start = d.defaultPageStart;
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }

  const { data, error: dbError } = await untypedFrom(supabase)
    .from('chapters')
    .update(update)
    .eq('id', id)
    .select('id, module_code, subject_id, slug, name, ordinal, default_book_id, default_page_start')
    .single();

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  await logActivity(supabase, {
    actorId: user.id,
    action: 'chapter_edited',
    entityType: 'chapter',
    entityId: id,
    summary: `Edited chapter "${(data as { name: string }).name}"`,
  });

  return NextResponse.json({ chapter: data });
}

/**
 * DELETE /api/admin/content/chapters/[id]
 *
 * Hard-deletes an empty chapter only (question_count = 0) —
 * refuses otherwise so a stray click can't silently orphan
 * published content. Re-tag or archive the questions first via
 * the Content Library if a populated chapter genuinely needs to
 * go away.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { user, supabase, error } = await requireAdmin();
  if (error) return error;

  const checkRes = await untypedFrom(supabase).from('chapters').select('name, question_count').eq('id', id).single();
  if (checkRes.error || !checkRes.data) {
    return NextResponse.json({ error: 'Chapter not found' }, { status: 404 });
  }
  const chapter = checkRes.data as { name: string; question_count: number };
  if ((chapter.question_count ?? 0) > 0) {
    return NextResponse.json(
      { error: `Chapter has ${chapter.question_count} question(s) — re-tag or archive them first` },
      { status: 409 }
    );
  }

  const { error: dbError } = await untypedFrom(supabase).from('chapters').delete().eq('id', id);
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  await logActivity(supabase, {
    actorId: user.id,
    action: 'chapter_deleted',
    entityType: 'chapter',
    entityId: id,
    summary: `Deleted empty chapter "${chapter.name}"`,
  });

  return NextResponse.json({ ok: true });
}
