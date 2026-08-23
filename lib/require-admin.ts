import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { createRouteHandlerClient, untypedFrom } from '@/lib/supabase-server';
import type { Database, UserRole } from '@/lib/supabase';

export type RequireAdminResult =
  | { user: User; supabase: SupabaseClient<Database>; error: null }
  | { user: null; supabase: null; error: NextResponse };

/**
 * Single shared admin gate for every /api/admin/content/* route.
 *
 * Replaces 13 copy-pasted (6 as a local function, 7 fully inlined)
 * versions of this same check on the b2c-pivot-rebuild branch this
 * was ported from — one of those inlined copies (admin/subjects
 * GET) was missing the role check entirely despite its own comment
 * claiming otherwise. Consolidating to one implementation means
 * that class of drift can't happen again.
 *
 * Queries `profiles.role` fresh on every call via the request-scoped
 * (RLS-bound, not service-role) client — `profiles_owner_select`'s
 * `auth.uid() = id` policy permits this self-read, so a role change
 * is reflected on the very next request, never cached/stale.
 */
export async function requireAdmin(): Promise<RequireAdminResult> {
  const supabase = await createRouteHandlerClient<Database>({ cookies });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      user: null,
      supabase: null,
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }

  const profileRes = await untypedFrom(supabase)
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  const role = (profileRes.data as { role: UserRole } | null)?.role;

  if (role !== 'admin') {
    return {
      user: null,
      supabase: null,
      error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    };
  }

  return { user, supabase, error: null };
}
