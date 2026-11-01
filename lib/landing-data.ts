import { createClient } from '@supabase/supabase-js';
import {
  LANDING_MODULE_CODES,
  fetchCatalogueStats,
  fetchLandingModules,
  type AnonCatalogueClient,
  type CatalogueStats,
  type LandingModuleCard,
} from '@/lib/catalogue-stats';

export type LandingData = {
  stats: CatalogueStats | null;
  modules: LandingModuleCard[] | null;
};

/**
 * Server-side load of the public landing page's catalogue strip, so the
 * module names and counts are in the first-pass HTML (crawlers, and no
 * "Loading the curriculum…" layout shift).
 *
 * Uses a plain anon client with no cookies/session — calling cookies()
 * here would make `/` fully dynamic and defeat the ISR the page relies
 * on. It runs the exact same queries as the browser path
 * (lib/catalogue-stats.ts), which RLS already limits to the anon
 * column-limited SELECT on `modules` and `chapters`.
 *
 * Never throws and never returns a misleading empty result: the
 * catalogue helpers swallow query errors into zeros, so an empty
 * result is mapped to `null` and the client falls back to its own
 * fetch instead of the page baking "0 modules" into the cache.
 */
export async function loadLandingData(): Promise<LandingData> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return { stats: null, modules: null };

  try {
    const client = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    }) as unknown as AnonCatalogueClient;

    const [stats, modules] = await Promise.all([
      fetchCatalogueStats(client),
      fetchLandingModules(LANDING_MODULE_CODES, client),
    ]);

    return {
      stats: stats.moduleCount > 0 ? stats : null,
      modules: modules.length > 0 ? modules : null,
    };
  } catch (err) {
    console.error('[landing] catalogue load failed, falling back to client fetch', err);
    return { stats: null, modules: null };
  }
}
