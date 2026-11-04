import { createBrowserClient } from '@/lib/supabase';

// modules/chapters/questions aren't in the typed Database shape
// (lib/supabase.ts) — the same untyped-client workaround used by
// every admin/student API route (lib/supabase-server.ts's
// untypedFrom), duplicated narrowly here rather than imported:
// that file is server-only (next/headers) and can't be pulled
// into this client-callable module.
export type AnonCatalogueClient = {
  from: (table: string) => any;
};

// Default is the browser client (client-side callers). The public
// landing page's server component passes a cookie-free anon client
// instead (lib/landing-data.ts) so the same queries run at build/ISR
// time without calling cookies() and making the page dynamic.
const browserAnon = (): AnonCatalogueClient => createBrowserClient() as unknown as AnonCatalogueClient;

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
 * service-role query behind an API route: modules_public_read and
 * chapters_public_read are `public`-role RLS policies, and migration
 * 038 leaves anon column-limited SELECT on exactly those two tables
 * (and nothing else), so the same function works identically for a
 * signed-in student and an anonymous landing-page visitor. Do NOT add
 * reads of other tables here — anon can't see them.
 */
export async function fetchCatalogueStats(
  client: AnonCatalogueClient = browserAnon(),
): Promise<CatalogueStats> {
  // The published-question total is the sum of chapters.published_count
  // (a trigger-maintained rollup, equal to count(published questions) —
  // 5447 = 5447 when checked) rather than a count over `questions`:
  // anon must not be able to read that table (migration 038), and the
  // public landing page calls this with the anon key.
  // ponytail: PostgREST returns at most 1000 rows, so the sum is exact
  // up to 1000 chapters (234 today); move to an aggregate RPC beyond that.
  const [modulesRes, chaptersRes] = await Promise.all([
    client.from('modules').select('code', { count: 'exact', head: true }),
    client.from('chapters').select('published_count', { count: 'exact' }),
  ]);

  const publishedQuestionCount = ((chaptersRes.data ?? []) as { published_count: number }[]).reduce(
    (sum, row) => sum + (Number(row.published_count) || 0),
    0
  );

  return {
    moduleCount: modulesRes.count ?? 0,
    chapterCount: chaptersRes.count ?? 0,
    publishedQuestionCount,
  };
}

export type LandingModuleCard = {
  code: string;
  name: string;
  yearNum: number;
  publishedCount: number;
};

/**
 * Real name/year/published-count for every module — used by the public
 * landing page's catalogue strip. Every module, not a hardcoded list,
 * so a newly published module shows up as live on its own (within the
 * page's ISR window). publishedCount is the same aggregate already
 * confirmed correct on /api/student/catalogue/modules-by-year (sum of
 * chapters.published_count across every chapter in the module), just
 * computed here via the anon-scoped client instead of that
 * authenticated route. Sorted by year, then code.
 */
export async function fetchLandingModules(
  client: AnonCatalogueClient = browserAnon(),
): Promise<LandingModuleCard[]> {
  // ponytail: PostgREST returns at most 1000 rows; chapters is ~234 today
  // (see fetchCatalogueStats), move the per-module sum to an RPC beyond that.
  const [modulesRes, chaptersRes] = await Promise.all([
    client.from('modules').select('code, name, year_num'),
    client.from('chapters').select('module_code, published_count'),
  ]);

  const publishedByCode = new Map<string, number>();
  for (const row of (chaptersRes.data ?? []) as { module_code: string; published_count: number }[]) {
    publishedByCode.set(
      row.module_code,
      (publishedByCode.get(row.module_code) ?? 0) + (Number(row.published_count) || 0)
    );
  }

  const modules = (modulesRes.data ?? []) as { code: string; name: string; year_num: string }[];

  return modules
    .map((m) => ({
      code: m.code,
      name: m.name,
      yearNum: Number(m.year_num),
      publishedCount: publishedByCode.get(m.code) ?? 0,
    }))
    .sort((a, b) => a.yearNum - b.yearNum || a.code.localeCompare(b.code));
}
