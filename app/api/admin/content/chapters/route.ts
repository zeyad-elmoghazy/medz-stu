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

const CreateChapterSchema = z
  .object({
    moduleCode: z.string().min(1),
    subjectId: z.string().uuid(),
    name: z.string().min(1).max(200),
    /** Insert at this position; later chapters move down by one. */
    ordinal: z.number().int().min(1).optional(),
    /**
     * Insert right after this chapter (same module + subject) and copy
     * its topic and reference book: the "split a long chapter" case.
     */
    afterChapterId: z.string().uuid().optional(),
    topic: z.string().trim().max(200).optional(),
  })
  .refine((d) => !(d.ordinal !== undefined && d.afterChapterId), {
    message: 'Pass either ordinal or afterChapterId, not both',
  });

type CreatedChapter = { id: string; module_code: string; subject_id: string; slug: string; name: string; ordinal: number };

// The request-scoped client doesn't carry the Database generic through
// .rpc(), so it's typed by hand here, as the student routes do.
type RpcClient = {
  rpc: (
    name: string,
    args: Record<string, unknown>
  ) => Promise<{ data: unknown; error: { message: string; code?: string } | null }>;
};

const UNIQUE_VIOLATION = '23505';

function chapterWriteError(err: { message: string; code?: string }) {
  if (err.code === UNIQUE_VIOLATION) {
    return NextResponse.json(
      { error: 'A chapter with this name already exists in this subject. Pick a different name.' },
      { status: 409 }
    );
  }
  if (err.code === '42501' || err.message.includes('admin_only')) {
    return NextResponse.json({ error: 'Admins only' }, { status: 403 });
  }
  return NextResponse.json({ error: err.message }, { status: 500 });
}

export async function POST(request: NextRequest) {
  const { user, supabase, error } = await requireAdmin();
  if (error) return error;

  const body = await request.json().catch(() => null);
  const parsed = CreateChapterSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 });
  }
  const d = parsed.data;
  const name = d.name.trim();
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

  let chapter: CreatedChapter;
  let position: string;

  if (d.afterChapterId || d.ordinal !== undefined) {
    // Insert in the middle: shift later chapters and insert atomically
    // (migration 042). Splitting inherits the parent's topic and book so
    // its reference images keep resolving to the right book.
    let ordinal = d.ordinal as number;
    let inherited: { topic: string | null; default_book_id: string | null; default_page_start: number | null } = {
      topic: null,
      default_book_id: null,
      default_page_start: null,
    };
    if (d.afterChapterId) {
      const afterRes = await untypedFrom(supabase)
        .from('chapters')
        .select('id, module_code, subject_id, ordinal, topic, default_book_id, default_page_start')
        .eq('id', d.afterChapterId)
        .maybeSingle();
      const after = afterRes.data as
        | { module_code: string; subject_id: string; ordinal: number; topic: string | null; default_book_id: string | null; default_page_start: number | null }
        | null;
      if (!after || after.module_code !== d.moduleCode || after.subject_id !== d.subjectId) {
        return NextResponse.json({ error: 'afterChapterId must be a chapter in the same module and subject' }, { status: 400 });
      }
      ordinal = after.ordinal + 1;
      inherited = { topic: after.topic, default_book_id: after.default_book_id, default_page_start: after.default_page_start };
    }

    const rpcRes = await (supabase as unknown as RpcClient).rpc('admin_insert_chapter_at', {
      p_module_code: d.moduleCode,
      p_subject_id: d.subjectId,
      p_name: name,
      p_slug: slug,
      p_ordinal: ordinal,
      p_topic: d.topic ?? inherited.topic,
      p_default_book_id: inherited.default_book_id,
      p_default_page_start: inherited.default_page_start,
    });
    if (rpcRes.error) return chapterWriteError(rpcRes.error);
    const row = rpcRes.data as CreatedChapter;
    chapter = { id: row.id, module_code: row.module_code, subject_id: row.subject_id, slug: row.slug, name: row.name, ordinal: row.ordinal };
    position = `at position ${chapter.ordinal}`;
  } else {
    // Append at the end: unchanged, so it works even before 042 is applied.
    const maxRes = await untypedFrom(supabase)
      .from('chapters')
      .select('ordinal')
      .eq('module_code', d.moduleCode)
      .eq('subject_id', d.subjectId)
      .order('ordinal', { ascending: false })
      .limit(1);
    const ordinal = ((maxRes.data as { ordinal: number }[] | null)?.[0]?.ordinal ?? 0) + 1;

    const { data, error: dbError } = await untypedFrom(supabase)
      .from('chapters')
      .insert({ module_code: d.moduleCode, subject_id: d.subjectId, slug, name, ordinal, ...(d.topic ? { topic: d.topic } : {}) })
      .select('id, module_code, subject_id, slug, name, ordinal')
      .single();
    if (dbError) return chapterWriteError(dbError);
    chapter = data as CreatedChapter;
    position = 'at the end';
  }

  await logActivity(supabase, {
    actorId: user.id,
    action: 'chapter_created',
    entityType: 'chapter',
    entityId: chapter.id,
    summary: `Created chapter "${name}" in Module ${d.moduleCode} ${position}`,
  });

  return NextResponse.json({ chapter }, { status: 201 });
}
