import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/require-admin';
import { untypedFrom } from '@/lib/supabase-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/content/questions/[id]/history
 *
 * A single question's edit history — "what changed, when, by
 * whom" — read from activity_log filtered to this question,
 * newest first.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase, error } = await requireAdmin();
  if (error) return error;

  const { data, error: dbError } = await untypedFrom(supabase)
    .from('activity_log')
    .select('id, actor_id, action, summary, diff, created_at, profiles(full_name, email)')
    .eq('entity_type', 'question')
    .eq('entity_id', id)
    .order('created_at', { ascending: false })
    .limit(50);

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
  return NextResponse.json({ history: data ?? [] });
}
