import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/require-admin';
import { untypedFrom } from '@/lib/supabase-server';
import { logActivity } from '@/lib/admin-activity';
import { invalidateCache } from '@/lib/cache';
import { CACHE_KEYS } from '@/lib/redis';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ChoiceSchema = z.object({ id: z.string().min(1).max(4), text: z.string().min(1).max(500) });

/**
 * REWRITTEN from the b2c-pivot-rebuild source, same reasoning as
 * questions/route.ts: no referenceBookId field. Leaving it in would
 * let a PATCH reintroduce per-question book overriding through the
 * back door — the module owns the book now, not the question.
 */
const PatchQuestionSchema = z.object({
  question: z.string().min(10).max(2000).optional(),
  choices: z.array(ChoiceSchema).min(2).max(5).optional(),
  correctAnswer: z.string().min(1).max(4).optional(),
  explanation: z.string().max(2000).optional(),
  reference: z.string().max(500).optional(),
  referencePage: z.number().int().min(1).nullable().optional(),
  chapterId: z.string().uuid().optional(),
  difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
  status: z.enum(['draft', 'under_review', 'published', 'archived']).optional(),
});

const FIELD_TO_COLUMN: Record<string, string> = {
  question: 'question',
  choices: 'choices',
  correctAnswer: 'correct_answer',
  explanation: 'explanation',
  reference: 'reference',
  referencePage: 'reference_page',
  chapterId: 'chapter_id',
  difficulty: 'difficulty',
  status: 'status',
};

/**
 * PATCH /api/admin/content/questions/[id]
 *
 * Edits ANY question regardless of status, including already-
 * published ones. Edits to a published question go live immediately
 * (no re-review step, Admin are the trusted content owners) but
 * every field change is logged to activity_log with a before/after
 * diff.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { user, supabase, error } = await requireAdmin();
  if (error) return error;

  const body = await request.json().catch(() => null);
  const parsed = PatchQuestionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 });
  }
  const d = parsed.data;
  if (Object.keys(d).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }

  const beforeRes = await untypedFrom(supabase)
    .from('questions')
    .select('question, choices, correct_answer, explanation, reference, reference_page, chapter_id, difficulty, status, subject_id, chapters(module_code)')
    .eq('id', id)
    .single();
  if (beforeRes.error || !beforeRes.data) {
    return NextResponse.json({ error: 'Question not found' }, { status: 404 });
  }
  const before = beforeRes.data as Record<string, unknown>;

  if (d.choices && d.correctAnswer === undefined) {
    const currentAnswer = before.correct_answer as string;
    if (!d.choices.some((c) => c.id === currentAnswer)) {
      return NextResponse.json({ error: 'Updated choices no longer include the current correctAnswer — pass correctAnswer too' }, { status: 400 });
    }
  }
  if (d.correctAnswer && d.choices && !d.choices.some((c) => c.id === d.correctAnswer)) {
    return NextResponse.json({ error: 'correctAnswer must match a choice id' }, { status: 400 });
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const diff: Record<string, { before: unknown; after: unknown }> = {};
  for (const [field, value] of Object.entries(d)) {
    const column = FIELD_TO_COLUMN[field];
    update[column] = value;
    const beforeVal = before[column];
    if (JSON.stringify(beforeVal) !== JSON.stringify(value)) {
      diff[field] = { before: beforeVal, after: value };
    }
  }

  const { data: updated, error: dbError } = await untypedFrom(supabase)
    .from('questions')
    .update(update)
    .eq('id', id)
    .select('id, chapter_id, status, subject_id')
    .single();

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  const wasPublished = before.status === 'published';
  const isNowPublished = (updated as { status: string }).status === 'published';
  const moduleCode = (before.chapters as { module_code: string } | null)?.module_code ?? '?';

  const action = !wasPublished && isNowPublished
    ? 'question_published'
    : d.status === 'archived'
      ? 'question_archived'
      : 'question_edited';

  await logActivity(supabase, {
    actorId: user.id,
    action,
    entityType: 'question',
    entityId: id,
    summary: `${action === 'question_published' ? 'Published' : action === 'question_archived' ? 'Archived' : 'Edited'} question in Module ${moduleCode}`,
    diff: Object.keys(diff).length ? diff : null,
  });

  if (wasPublished || isNowPublished) {
    await invalidateCache(
      CACHE_KEYS.subjectList(),
      CACHE_KEYS.questionBank((updated as { subject_id: string }).subject_id)
    );
  }

  return NextResponse.json({ question: updated });
}

/**
 * DELETE /api/admin/content/questions/[id]
 *
 * Soft-delete: sets status='archived' rather than a hard DELETE,
 * so the edit-history trail in activity_log stays meaningful and
 * a mis-click is recoverable via PATCH status=draft|published.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { user, supabase, error } = await requireAdmin();
  if (error) return error;

  const beforeRes = await untypedFrom(supabase).from('questions').select('status, subject_id, chapters(module_code)').eq('id', id).single();
  if (beforeRes.error || !beforeRes.data) {
    return NextResponse.json({ error: 'Question not found' }, { status: 404 });
  }
  const before = beforeRes.data as { status: string; subject_id: string; chapters: { module_code: string } | null };

  const { error: dbError } = await untypedFrom(supabase)
    .from('questions')
    .update({ status: 'archived', updated_at: new Date().toISOString() })
    .eq('id', id);
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  await logActivity(supabase, {
    actorId: user.id,
    action: 'question_archived',
    entityType: 'question',
    entityId: id,
    summary: `Archived question in Module ${before.chapters?.module_code ?? '?'}`,
    diff: { status: { before: before.status, after: 'archived' } },
  });

  if (before.status === 'published') {
    await invalidateCache(CACHE_KEYS.subjectList(), CACHE_KEYS.questionBank(before.subject_id));
  }

  return NextResponse.json({ ok: true, status: 'archived' });
}
