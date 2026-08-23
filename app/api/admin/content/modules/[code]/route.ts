import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/require-admin';
import { untypedFrom } from '@/lib/supabase-server';
import { logActivity } from '@/lib/admin-activity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PatchModuleSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  year_num: z.string().min(1).max(10).optional(),
  year_label: z.string().min(1).max(100).optional(),
  is_active: z.boolean().optional(),
  // Module-level book assignment (019_module_book_and_import_idempotency.sql)
  // — nullable so a book can be unassigned, not just swapped.
  book_id: z.string().uuid().nullable().optional(),
});

/**
 * PATCH /api/admin/content/modules/[code]
 *
 * Edits a module's name/year/active flag/book assignment. Logs a
 * diff to activity_log so the Overview feed shows what changed.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const { user, supabase, error } = await requireAdmin();
  if (error) return error;

  const body = await request.json().catch(() => null);
  const parsed = PatchModuleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 });
  }
  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }

  const beforeRes = await untypedFrom(supabase)
    .from('modules')
    .select('name, year_num, year_label, is_active, book_id')
    .eq('code', code)
    .single();
  if (beforeRes.error || !beforeRes.data) {
    return NextResponse.json({ error: 'Module not found' }, { status: 404 });
  }
  const before = beforeRes.data as {
    name: string;
    year_num: string;
    year_label: string;
    is_active: boolean;
    book_id: string | null;
  };

  const { data: updated, error: dbError } = await untypedFrom(supabase)
    .from('modules')
    .update(parsed.data)
    .eq('code', code)
    .select('code, name, year_num, year_label, is_active, book_id')
    .single();

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  const diff: Record<string, { before: unknown; after: unknown }> = {};
  for (const key of Object.keys(parsed.data) as (keyof typeof parsed.data)[]) {
    const beforeVal = before[key as keyof typeof before];
    const afterVal = parsed.data[key];
    if (beforeVal !== afterVal) diff[key] = { before: beforeVal, after: afterVal };
  }

  await logActivity(supabase, {
    actorId: user.id,
    action: 'module_edited',
    entityType: 'module',
    entityId: code,
    summary: `Edited Module ${code}`,
    diff,
  });

  return NextResponse.json({ module: updated });
}
