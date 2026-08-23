import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createRouteHandlerClient, untypedFrom } from '@/lib/supabase-server';
import type { Database, UserRole } from '@/lib/supabase';

/**
 * Single role==='admin' gate for the whole /admin/content/* tree.
 *
 * proxy.ts's broad '/admin' prefix already gates this at the
 * middleware level (redirecting unauthenticated/wrong-role requests
 * before a page ever renders) — this is the second, redundant check,
 * matching this codebase's existing "the gate isn't the only gate"
 * convention (RLS is the backstop everywhere else; every admin API
 * route re-checks role itself too via requireAdmin()).
 */
export default async function AdminContentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createRouteHandlerClient<Database>({ cookies });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const profileRes = await untypedFrom(supabase).from('profiles').select('role').eq('id', user.id).single();
  const role = (profileRes.data as { role: UserRole } | null)?.role;

  if (role !== 'admin') {
    redirect('/login');
  }

  return <>{children}</>;
}
