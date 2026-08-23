import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/require-admin';
import { untypedFrom } from '@/lib/supabase-server';
import { logActivity } from '@/lib/admin-activity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/content/subjects
 *
 * The full global subject catalog — used to populate the "assign
 * existing subject" dropdown in Taxonomy Management. Any signed-in
 * user could technically read this (subjects RLS is public-read),
 * but this route is admin-gated anyway since it's Admin-Dashboard-
 * only UI plumbing, not a student-facing endpoint.
 *
 * FIX (found during the b2c-pivot-rebuild review this was ported
 * from): the original GET only checked `if (!user)` — it never
 * actually verified the admin role, despite this same doc comment
 * claiming it did. Every other route in this set enforces the role
 * check even on reads; this one now does too.
 */
export async function GET() {
  const { supabase, error } = await requireAdmin();
  if (error) return error;

  const { data, error: dbError } = await untypedFrom(supabase)
    .from('subjects')
    .select('id, slug, name, is_active')
    .order('name', { ascending: true });

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
  return NextResponse.json({ subjects: data ?? [] });
}

const CreateSubjectSchema = z.object({ name: z.string().min(1).max(100) });

/**
 * POST /api/admin/content/subjects
 *
 * Creates a subject with no module assignment yet. Most of the
 * time you'll create+assign in one call via
 * POST /api/admin/content/modules/[code]/subjects instead — this
 * exists for the rarer "add to the catalog now, assign to a module
 * later" case.
 */
export async function POST(request: NextRequest) {
  const { user, supabase, error } = await requireAdmin();
  if (error) return error;

  const body = await request.json().catch(() => null);
  const parsed = CreateSubjectSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 });
  }

  const slug = parsed.data.name.trim().toLowerCase().replace(/\s+/g, '-');
  const { data, error: dbError } = await untypedFrom(supabase)
    .from('subjects')
    .insert({ slug, name: parsed.data.name.trim() })
    .select('id, slug, name')
    .single();

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  await logActivity(supabase, {
    actorId: user.id,
    action: 'subject_created',
    entityType: 'subject',
    entityId: (data as { id: string }).id,
    summary: `Created subject "${parsed.data.name.trim()}"`,
  });

  return NextResponse.json({ subject: data }, { status: 201 });
}
