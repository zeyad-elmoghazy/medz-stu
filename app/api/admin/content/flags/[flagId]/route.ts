import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/require-admin';
import { untypedFrom } from '@/lib/supabase-server';
import { logActivity } from '@/lib/admin-activity';
import { applyRateLimit } from '@/lib/apply-rate-limit';
import { adminLimiter } from '@/lib/rate-limit';
import { FLAG_REASON_LABELS, type FlagReason } from '@/lib/question-flags';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ParamsSchema = z.object({ flagId: z.string().uuid() });
const BodySchema = z.object({ resolved: z.boolean() });

/**
 * PATCH /api/admin/content/flags/[flagId]   body: { resolved: boolean }
 *
 * Closes (or reopens) one student report. Sets resolved_at /
 * resolved_by alongside `resolved`; the on_flag_change trigger then
 * recomputes questions.flag_count (unresolved reports only), which is
 * what the Review Queue's "Flagged by N" line and the dashboard read.
 *
 * Goes through the request-scoped client under flags_admin_update
 * (033_question_flag_admin.sql), so a non-admin could never reach the
 * UPDATE even if requireAdmin() were bypassed.
 */
export async function PATCH(
  request: NextRequest,
  props: { params: Promise<{ flagId: string }> }
) {
  const params = ParamsSchema.safeParse(await props.params);
  if (!params.success) {
    return NextResponse.json({ error: 'Invalid flag id' }, { status: 400 });
  }

  const { user, supabase, error } = await requireAdmin();
  if (error) return error;

  const limited = await applyRateLimit(request, adminLimiter, user.id);
  if (limited) return limited;

  const body = await request.json().catch(() => null);
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }
  const { resolved } = parsed.data;

  const client = untypedFrom(supabase);
  const { data, error: dbError } = await client
    .from('question_flags')
    .update({
      resolved,
      resolved_at: resolved ? new Date().toISOString() : null,
      resolved_by: resolved ? user.id : null,
    })
    .eq('id', params.data.flagId)
    .select('id, question_id, reason, resolved, resolved_at')
    .maybeSingle();

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: 'Report not found' }, { status: 404 });
  }

  const row = data as {
    id: string;
    question_id: number;
    reason: string;
    resolved: boolean;
    resolved_at: string | null;
  };
  const reasonLabel = FLAG_REASON_LABELS[row.reason as FlagReason] ?? row.reason;

  await logActivity(supabase, {
    actorId: user.id,
    action: resolved ? 'question_report_resolved' : 'question_report_reopened',
    entityType: 'question_flag',
    entityId: row.id,
    summary: `${resolved ? 'Resolved' : 'Reopened'} a student report on question #${row.question_id} (${reasonLabel})`,
  });

  return NextResponse.json({
    flag: { id: row.id, resolved: row.resolved, resolvedAt: row.resolved_at },
  });
}
