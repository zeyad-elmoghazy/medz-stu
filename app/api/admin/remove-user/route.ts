import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@/lib/supabase-server';
import { z } from 'zod';
import { applyRateLimit } from '@/lib/apply-rate-limit';
import { adminLimiter } from '@/lib/rate-limit';
import { invalidateCache } from '@/lib/cache';
import { CACHE_KEYS } from '@/lib/redis';
import type { Database, UserRole } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// `targetUserId` must be a UUID — defeats path-traversal style
// payloads and stops accidental string injection into the DB.
const RemoveUserSchema = z.object({
  targetUserId: z.string().uuid(),
});

/**
 * POST /api/admin/remove-user
 *
 * Hard-delete a user account.
 *
 * Flow:
 *   1. Authenticate.
 *   2. Verify the caller's role is `admin`. RLS would also block
 *      a non-admin DELETE, but checking here gives us a clean 403
 *      and avoids burning a rate-limit token on a forbidden call.
 *   3. Apply the admin limiter (20/min). Bulk-remove scripts will
 *      get throttled; a real admin clicking through the UI won't.
 *   4. Delete from profiles. Cascading FK rules drop the user's
 *      sessions, bookmarks, notes, etc.
 *   5. Invalidate any caches keyed by the removed user id.
 */
export async function POST(request: NextRequest) {
  const supabase = await createRouteHandlerClient<Database>({ cookies });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const profileQuery = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  const profile = profileQuery.data as { role: UserRole } | null;

  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Rate limit keyed on the admin's user id so several admins can
  // work in parallel without sharing a budget.
  const limited = await applyRateLimit(request, adminLimiter, user.id);
  if (limited) return limited;

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = RemoveUserSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid payload', issues: parsed.error.issues },
      { status: 400 }
    );
  }
  const payload = parsed.data;

  if (payload.targetUserId === user.id) {
    return NextResponse.json(
      { error: 'Admins cannot remove their own account from this endpoint' },
      { status: 400 }
    );
  }

  const { error: deleteError } = await supabase
    .from('profiles')
    .delete()
    .eq('id', payload.targetUserId);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  // Drop any cached views of the removed user so an inflight
  // dashboard load doesn't keep painting their data.
  await invalidateCache(
    CACHE_KEYS.studentProfile(payload.targetUserId),
    CACHE_KEYS.studentAnalytics(payload.targetUserId)
  );

  return NextResponse.json({ ok: true, removed: payload.targetUserId });
}
