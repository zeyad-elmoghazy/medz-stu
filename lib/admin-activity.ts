import type { SupabaseClient } from '@supabase/supabase-js';

export type ActivityEntry = {
  actorId: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  summary: string;
  diff?: Record<string, { before: unknown; after: unknown }> | null;
};

/**
 * Write one row to `activity_log` (016_admin_activity_log.sql).
 *
 * Fire-and-forget by design: this is an internal audit trail for
 * the Admin Dashboard's Overview feed and per-question edit
 * history, not a data-integrity gate. A logging failure should
 * never fail the primary write (publishing a question, creating a
 * module, etc.) that triggered it — so this swallows its own
 * errors after logging them server-side.
 *
 * The `supabase` param is loosely typed (matches the rest of this
 * codebase's untyped-chain convention for tables the generated
 * `Database` type doesn't cover yet) rather than importing the
 * full route-handler client type, so this can be called from any
 * admin route without fighting the generic.
 */
export async function logActivity(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  entry: ActivityEntry
): Promise<void> {
  try {
    await supabase.from('activity_log').insert({
      actor_id: entry.actorId,
      action: entry.action,
      entity_type: entry.entityType,
      entity_id: entry.entityId ?? null,
      summary: entry.summary,
      diff: entry.diff ?? null,
    });
  } catch (err) {
    console.error('[admin-activity] failed to log activity:', err);
  }
}
