import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/require-admin';
import { untypedFrom } from '@/lib/supabase-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/content/books
 *
 * Minimal listing for the module book-assignment dropdown — id and
 * title only, nothing else. No create/update/delete here; books
 * still get added directly via SQL, per founder decision that the
 * reference-books catalog stays externally populated.
 */
export async function GET() {
  const { supabase, error } = await requireAdmin();
  if (error) return error;

  const { data, error: dbError } = await untypedFrom(supabase)
    .from('reference_books')
    .select('id, title')
    .order('title', { ascending: true });

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
  return NextResponse.json({ books: data ?? [] });
}
