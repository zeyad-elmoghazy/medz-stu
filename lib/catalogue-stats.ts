import { createBrowserClient } from '@/lib/supabase';

export type CatalogueStats = {
  moduleCount: number;
  chapterCount: number;
  publishedQuestionCount: number;
};

/**
 * Real structural counts for the Catalogue — modules, chapters, and
 * published questions. Shared by the student dashboard and the
 * public landing page so neither hardcodes a number that drifts
 * from the database.
 *
 * Uses the anon-scoped browser client deliberately, not a
 * service-role query behind an API route: modules_public_read,
 * chapters_public_read, and questions_read_published are all
 * `public`-role RLS policies with no auth requirement — confirmed
 * both by reading pg_policies and with a live unauthenticated REST
 * call before writing this — so the same function works
 * identically for a signed-in student and an anonymous landing-page
 * visitor. `status = 'published'` is still filtered explicitly
 * below rather than relied on via RLS alone, matching this
 * codebase's existing convention elsewhere.
 */
export async function fetchCatalogueStats(): Promise<CatalogueStats> {
  const supabase = createBrowserClient();

  // modules/chapters/questions aren't in the typed Database shape
  // (lib/supabase.ts) — the same untyped-client workaround used by
  // every admin/student API route (lib/supabase-server.ts's
  // untypedFrom), duplicated narrowly here rather than imported:
  // that file is server-only (next/headers) and can't be pulled
  // into this client-callable module.
  const client = supabase as unknown as {
    from: (table: string) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
  };

  const [modulesRes, chaptersRes, questionsRes] = await Promise.all([
    client.from('modules').select('code', { count: 'exact', head: true }),
    client.from('chapters').select('id', { count: 'exact', head: true }),
    client.from('questions').select('id', { count: 'exact', head: true }).eq('status', 'published'),
  ]);

  return {
    moduleCount: modulesRes.count ?? 0,
    chapterCount: chaptersRes.count ?? 0,
    publishedQuestionCount: questionsRes.count ?? 0,
  };
}
