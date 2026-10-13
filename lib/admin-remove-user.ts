import type { SupabaseClient } from '@supabase/supabase-js';
import { logActivity } from '@/lib/admin-activity';

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyClient = SupabaseClient<any, any, any>;
/* eslint-enable @typescript-eslint/no-explicit-any */

export type RemoveStudentResult =
  | { ok: true; removedId: string }
  | { ok: false; status: 400 | 404 | 500; error: string };

/**
 * Admin hard-removal of a STUDENT account.
 *
 * Deletes the `auth.users` row (via the admin API on the service-role
 * client), which cascades to `profiles` and every student-owned table
 * (quiz_sessions, bookmarks, notes, daily_streaks, badges, …) and ends
 * the person's ability to log in. The old routes only deleted from
 * `profiles` with the admin's own session; no DELETE policy exists, so
 * that matched zero rows, "succeeded", and never touched the login.
 *
 * Guards: never yourself; the target must exist; only `student` accounts
 * (admins are not removable through this endpoint). `logClient` is the
 * admin's own session — `activity_log` inserts are admin-only by policy.
 */
export async function removeStudentAccount(opts: {
  service: AnyClient;
  logClient: AnyClient;
  actorId: string;
  targetUserId: string;
}): Promise<RemoveStudentResult> {
  const { service, logClient, actorId, targetUserId } = opts;

  if (targetUserId === actorId) {
    return {
      ok: false,
      status: 400,
      error: 'Admins cannot remove their own account from this endpoint',
    };
  }

  const { data: target, error: lookupError } = await service
    .from('profiles')
    .select('id, role, email')
    .eq('id', targetUserId)
    .maybeSingle();

  if (lookupError) {
    console.error('[admin-remove-user] lookup failed:', lookupError.message);
    return { ok: false, status: 500, error: 'Could not look up that user' };
  }
  if (!target) {
    return { ok: false, status: 404, error: 'User not found' };
  }
  if (target.role !== 'student') {
    return {
      ok: false,
      status: 400,
      error: 'Only student accounts can be removed here',
    };
  }

  const { error: deleteError } = await service.auth.admin.deleteUser(targetUserId);
  if (deleteError) {
    console.error('[admin-remove-user] delete failed:', deleteError.message);
    return { ok: false, status: 500, error: 'Could not remove that user' };
  }

  await logActivity(logClient, {
    actorId,
    action: 'user_removed',
    entityType: 'user',
    entityId: targetUserId,
    summary: `Removed student account ${target.email ?? targetUserId}`,
  });

  return { ok: true, removedId: targetUserId };
}
