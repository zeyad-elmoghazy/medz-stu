// Server-only: builds a Supabase client with the service-role key, which
// BYPASSES row-level security. `server-only` makes the build fail if this
// module is ever pulled into client code, so the key can't be bundled.
import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase';

/**
 * A fresh service-role client (no session persistence). Use it only
 * AFTER the route has authenticated the caller, and scope every query by
 * the authenticated user's id — it will not be filtered by RLS.
 */
export function serviceRoleClient(): SupabaseClient<Database> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.'
    );
  }
  return createClient<Database>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
