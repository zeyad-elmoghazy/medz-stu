// Server-only Supabase helpers. Split from lib/supabase.ts so that
// modules importing the browser client don't accidentally pull in
// `next/headers` (which Next 16 refuses to bundle into anything
// reachable from the client).
import 'server-only';
import { createServerClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { cookies as nextCookies } from 'next/headers';
import type { Database } from '@/lib/supabase';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

// Drop-in replacement for the deprecated auth-helpers
// `createRouteHandlerClient`. Same call shape at the callsite —
// `createRouteHandlerClient<Database>({ cookies })` — but returns a
// Promise, because Next 15+ made `cookies()` async and every caller
// now needs `await`. The `{ cookies }` argument is only kept for
// grep-compat with the old signature; we import `next/headers`
// directly here.
export async function createRouteHandlerClient<T = Database>(
  _opts?: { cookies: unknown },
): Promise<SupabaseClient<T>> {
  const store = await nextCookies();
  return createServerClient<T>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        // Server components can't write cookies; swallow so
        // read-only paths (RSC, generateMetadata) still work.
        // Route handlers and middleware reach the .set() branch.
        try {
          list.forEach(({ name, value, options }) =>
            store.set(name, value, options),
          );
        } catch {
          /* read-only context */
        }
      },
    },
  });
}
