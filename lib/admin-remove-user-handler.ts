import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/require-admin';
import { applyRateLimit } from '@/lib/apply-rate-limit';
import { adminLimiter } from '@/lib/rate-limit';
import { invalidateCache } from '@/lib/cache';
import { CACHE_KEYS } from '@/lib/redis';
import { serviceRoleClient } from '@/lib/supabase-service';
import { removeStudentAccount } from '@/lib/admin-remove-user';

// `targetUserId` must be a UUID — defeats path-traversal style
// payloads and stops accidental string injection into the DB.
const RemoveUserSchema = z.object({
  targetUserId: z.string().uuid(),
});

/**
 * Shared POST handler for both admin remove-user endpoints
 * (`/api/admin/remove-user` and `/api/admin/content/remove-user`).
 *
 *   1. Authenticate + verify admin (requireAdmin).
 *   2. Admin rate limiter (20/min, keyed on the admin's id).
 *   3. Validate the payload.
 *   4. removeStudentAccount(): deletes the auth user (cascading the
 *      profile and all student data) with the service-role key.
 *   5. Invalidate cached views of the removed user.
 */
export async function handleRemoveUser(request: NextRequest): Promise<NextResponse> {
  const { user, supabase, error } = await requireAdmin();
  if (error) return error;

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

  let service;
  try {
    service = serviceRoleClient();
  } catch (err) {
    console.error('[admin-remove-user] service client unavailable:', err);
    return NextResponse.json(
      { error: 'Account removal is not configured on this server' },
      { status: 500 }
    );
  }

  const result = await removeStudentAccount({
    service,
    logClient: supabase,
    actorId: user.id,
    targetUserId: parsed.data.targetUserId,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  // Drop any cached views of the removed user so an inflight
  // dashboard load doesn't keep painting their data.
  await invalidateCache(
    CACHE_KEYS.studentProfile(result.removedId),
    CACHE_KEYS.studentAnalytics(result.removedId)
  );

  return NextResponse.json({ ok: true, removed: result.removedId });
}
