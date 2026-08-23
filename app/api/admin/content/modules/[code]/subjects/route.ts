import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/require-admin';
import { untypedFrom } from '@/lib/supabase-server';
import { logActivity } from '@/lib/admin-activity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/content/modules/[code]/subjects
 *
 * Subjects currently assigned to this module (via module_subjects).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const { supabase, error } = await requireAdmin();
  if (error) return error;

  const { data, error: dbError } = await untypedFrom(supabase)
    .from('module_subjects')
    .select('subject_id, subjects(id, slug, name)')
    .eq('module_code', code);

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
  return NextResponse.json({ subjects: (data ?? []).map((r: unknown) => (r as { subjects: unknown }).subjects) });
}

// Either assign an existing global subject by id, or create a new
// global subject (by name) and assign it in one call.
const AssignSchema = z.union([
  z.object({ subjectId: z.string().uuid() }),
  z.object({ name: z.string().min(1).max(100) }),
]);

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const { user, supabase, error } = await requireAdmin();
  if (error) return error;

  const body = await request.json().catch(() => null);
  const parsed = AssignSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body — provide subjectId (existing) or name (new)' }, { status: 400 });
  }

  let subjectId: string;
  let subjectName: string;

  if ('subjectId' in parsed.data) {
    subjectId = parsed.data.subjectId;
    const subjRes = await untypedFrom(supabase).from('subjects').select('name').eq('id', subjectId).single();
    if (subjRes.error || !subjRes.data) {
      return NextResponse.json({ error: 'Subject not found' }, { status: 404 });
    }
    subjectName = (subjRes.data as { name: string }).name;
  } else {
    const slug = parsed.data.name.trim().toLowerCase().replace(/\s+/g, '-');
    const createRes = await untypedFrom(supabase)
      .from('subjects')
      .insert({ slug, name: parsed.data.name.trim() })
      .select('id, name')
      .single();
    if (createRes.error) {
      return NextResponse.json({ error: createRes.error.message }, { status: 500 });
    }
    subjectId = (createRes.data as { id: string }).id;
    subjectName = (createRes.data as { name: string }).name;
  }

  const { error: linkError } = await untypedFrom(supabase)
    .from('module_subjects')
    .insert({ module_code: code, subject_id: subjectId });

  if (linkError) {
    // Unique violation = already assigned — treat as success (idempotent).
    if (!linkError.message.includes('duplicate key')) {
      return NextResponse.json({ error: linkError.message }, { status: 500 });
    }
  }

  await logActivity(supabase, {
    actorId: user.id,
    action: 'subject_assigned',
    entityType: 'module',
    entityId: code,
    summary: `Assigned ${subjectName} to Module ${code}`,
  });

  return NextResponse.json({ subjectId, name: subjectName }, { status: 201 });
}

/**
 * DELETE /api/admin/content/modules/[code]/subjects?subjectId=...
 *
 * Unassigns a subject from a module. Does NOT delete the subject's
 * chapters or questions — unassigning is meant to be a reversible
 * taxonomy edit, not a content-destroying one.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const { user, supabase, error } = await requireAdmin();
  if (error) return error;

  const subjectId = new URL(request.url).searchParams.get('subjectId');
  if (!subjectId) return NextResponse.json({ error: 'subjectId query param required' }, { status: 400 });

  const { error: dbError } = await untypedFrom(supabase)
    .from('module_subjects')
    .delete()
    .eq('module_code', code)
    .eq('subject_id', subjectId);

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  await logActivity(supabase, {
    actorId: user.id,
    action: 'subject_unassigned',
    entityType: 'module',
    entityId: code,
    summary: `Unassigned a subject from Module ${code}`,
  });

  return NextResponse.json({ ok: true });
}
