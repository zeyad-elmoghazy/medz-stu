import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/require-admin';
import { untypedFrom } from '@/lib/supabase-server';
import { applyRateLimit } from '@/lib/apply-rate-limit';
import { adminLimiter } from '@/lib/rate-limit';
import { logActivity } from '@/lib/admin-activity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CreateModuleSchema = z.object({
  code: z.string().regex(/^\d{3}$/, 'Module code must be 3 digits, e.g. "101"'),
  name: z.string().min(1).max(200),
  year_num: z.string().min(1).max(10),
  year_label: z.string().min(1).max(100),
  is_active: z.boolean().optional().default(false),
});

/**
 * GET /api/admin/content/modules
 *
 * Full module list for the Taxonomy Management screen — includes
 * inactive modules (unlike the public /api/modules), since Admin
 * needs to see and edit modules before flipping them live.
 */
export async function GET() {
  const { supabase, error } = await requireAdmin();
  if (error) return error;

  const { data, error: dbError } = await untypedFrom(supabase)
    .from('modules')
    .select('code, name, year_num, year_label, is_active, book_id')
    .order('code', { ascending: true });

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
  return NextResponse.json({ modules: data ?? [] });
}

/**
 * POST /api/admin/content/modules
 *
 * Creates a module. Enforces the code[0] == year_num convention
 * as a soft validation — mismatches get flagged in the response
 * but don't block creation, since a founder might have a real
 * reason to deviate.
 */
export async function POST(request: NextRequest) {
  const { user, supabase, error } = await requireAdmin();
  if (error) return error;

  const limited = await applyRateLimit(request, adminLimiter, user.id);
  if (limited) return limited;

  const body = await request.json().catch(() => null);
  const parsed = CreateModuleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;

  const codeYearWarning =
    data.code[0] !== data.year_num[0]
      ? `Heads up: code "${data.code}" doesn't start with year_num "${data.year_num}" — double-check this is intentional.`
      : null;

  const { data: inserted, error: dbError } = await untypedFrom(supabase)
    .from('modules')
    .insert({
      code: data.code,
      name: data.name,
      year_num: data.year_num,
      year_label: data.year_label,
      is_active: data.is_active,
      subject_id: 'multi', // legacy column, superseded by module_subjects
    })
    .select('code, name, year_num, year_label, is_active')
    .single();

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  await logActivity(supabase, {
    actorId: user.id,
    action: 'module_created',
    entityType: 'module',
    entityId: data.code,
    summary: `Created Module ${data.code} — ${data.name}`,
  });

  return NextResponse.json({ module: inserted, warning: codeYearWarning }, { status: 201 });
}
