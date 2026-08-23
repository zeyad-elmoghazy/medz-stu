import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/require-admin';
import { untypedFrom } from '@/lib/supabase-server';
import { logActivity } from '@/lib/admin-activity';
import { invalidateCache } from '@/lib/cache';
import { CACHE_KEYS } from '@/lib/redis';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BulkSchema = z.object({
  ids: z.array(z.union([z.string(), z.number()])).min(1).max(500),
  action: z.enum(['publish', 'archive', 'retag']),
  chapterId: z.string().uuid().optional(), // required when action === 'retag'
});

/**
 * POST /api/admin/content/questions/bulk
 *
 * Bulk publish / archive / re-tag. One activity_log entry for the
 * whole batch (not one per question) so the Overview feed doesn't
 * get flooded by a single admin action.
 */
export async function POST(request: NextRequest) {
  const { user, supabase, error } = await requireAdmin();
  if (error) return error;

  const body = await request.json().catch(() => null);
  const parsed = BulkSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 });
  }
  const d = parsed.data;
  if (d.action === 'retag' && !d.chapterId) {
    return NextResponse.json({ error: 'chapterId is required for retag' }, { status: 400 });
  }

  const affectedRes = await untypedFrom(supabase).from('questions').select('id, subject_id, status').in('id', d.ids);
  if (affectedRes.error) return NextResponse.json({ error: affectedRes.error.message }, { status: 500 });
  const affected = (affectedRes.data ?? []) as { id: number; subject_id: string; status: string }[];
  const subjectIds = Array.from(new Set(affected.map((q) => q.subject_id)));

  const update: Record<string, unknown> =
    d.action === 'publish'
      ? { status: 'published', updated_at: new Date().toISOString() }
      : d.action === 'archive'
        ? { status: 'archived', updated_at: new Date().toISOString() }
        : { chapter_id: d.chapterId, updated_at: new Date().toISOString() };

  const { error: dbError, count } = await untypedFrom(supabase)
    .from('questions')
    .update(update, { count: 'exact' })
    .in('id', d.ids);

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  await logActivity(supabase, {
    actorId: user.id,
    action: `bulk_${d.action}`,
    entityType: 'question',
    entityId: null,
    summary: `Bulk ${d.action}: ${count ?? d.ids.length} question(s)`,
  });

  if (d.action === 'publish' || d.action === 'archive' || affected.some((q) => q.status === 'published')) {
    await invalidateCache(CACHE_KEYS.subjectList(), ...subjectIds.map((s) => CACHE_KEYS.questionBank(s)));
  }

  return NextResponse.json({ ok: true, updated: count ?? d.ids.length });
}
