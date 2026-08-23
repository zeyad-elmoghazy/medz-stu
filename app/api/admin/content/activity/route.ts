import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/require-admin';
import { untypedFrom } from '@/lib/supabase-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/content/activity
 *
 * Overview's unified Activity Log — "a real feed of everything
 * happening on the platform: new signups, questions published or
 * edited, users suspended/removed, anti-cheat violations logged,
 * streak milestones hit. Filterable by type and date."
 *
 * Query params: entityType (CSV, e.g. "question,user"), since
 * (ISO date), limit, offset.
 */
export async function GET(request: NextRequest) {
  const { supabase, error } = await requireAdmin();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const entityType = searchParams.get('entityType');
  const since = searchParams.get('since');
  const limit = Math.min(Number(searchParams.get('limit') ?? '50'), 200);
  const offset = Math.max(Number(searchParams.get('offset') ?? '0'), 0);

  let query = untypedFrom(supabase)
    .from('activity_log')
    .select('id, actor_id, action, entity_type, entity_id, summary, created_at, profiles(full_name, email)', { count: 'exact' });

  if (entityType) query = query.in('entity_type', entityType.split(',').filter(Boolean));
  if (since) query = query.gte('created_at', since);

  query = query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

  const { data, error: dbError, count } = await query;
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  return NextResponse.json({ activity: data ?? [], total: count ?? 0, limit, offset });
}
