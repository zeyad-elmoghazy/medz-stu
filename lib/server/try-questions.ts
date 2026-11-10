import 'server-only';
import { serviceRoleClient } from '@/lib/supabase-service';
import { untypedFrom } from '@/lib/supabase-server';
import { TRY_CONFIG, tryYears, type TryConfig } from '@/lib/try-config';

/**
 * The questions featured on the public /try page: per academic year, a sample
 * of one module. The bank is service-role only (migration 047), so this reads
 * with the service role and keeps the explicit status='published' filter.
 *
 * `loadTrySample` returns the answer key: it is for the check route. The page
 * must pass only `toPublicQuestions(rows)` to the browser.
 */

export type TryChoice = { id: string; text: string };
export type TryQuestion = { id: number; question: string; choices: TryChoice[] };
export type TryRow = TryQuestion & { correct_answer: string; explanation: string };
export type TrySample = { year: number; moduleName: string; rows: TryRow[] };

// PostgREST returns at most 1,000 rows per request, so the id list is paged.
const PAGE_SIZE = 1000;
// ponytail: a per-instance cache so the check route doesn't re-read a module's
// ids on every answer; the page itself is rendered once an hour.
const CACHE_MS = 10 * 60 * 1000;
const cache = new Map<string, { at: number; value: TrySample | null }>();

/** `count` items spread evenly across `items` (all of them when there are no more than `count`). */
export function pickEvenly<T>(items: readonly T[], count: number): T[] {
  if (count <= 0) return [];
  if (items.length <= count) return [...items];
  return Array.from({ length: count }, (_, i) => items[Math.floor(((i + 0.5) * items.length) / count)]);
}

async function loadUncached(year: number, config: TryConfig): Promise<TrySample | null> {
  const code = config.modules[year];
  if (!code) return null;
  const db = untypedFrom(serviceRoleClient());

  const moduleRes = await db
    .from('modules')
    .select('name')
    .eq('code', code)
    .eq('is_active', true)
    .maybeSingle();
  if (moduleRes.error) throw new Error(`[try] could not load module ${code}: ${moduleRes.error.message}`);
  const moduleName = (moduleRes.data as { name: string } | null)?.name;
  if (!moduleName) return null;

  // Every published question id of the module (ids only), in id order.
  const ids: number[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const res = await db
      .from('questions')
      .select('id, chapters!inner(module_code)')
      .eq('status', 'published')
      .eq('chapters.module_code', code)
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (res.error) throw new Error(`[try] could not list questions of ${code}: ${res.error.message}`);
    const batch = (res.data ?? []) as { id: number }[];
    ids.push(...batch.map((r) => r.id));
    if (batch.length < PAGE_SIZE) break;
  }

  const picked = pickEvenly(ids, config.questionCount);
  if (picked.length === 0) return null;

  const rowsRes = await db
    .from('questions')
    .select('id, question, choices, correct_answer, explanation')
    .in('id', picked)
    .eq('status', 'published');
  if (rowsRes.error) throw new Error(`[try] could not load the sample of ${code}: ${rowsRes.error.message}`);
  const byId = new Map(((rowsRes.data ?? []) as TryRow[]).map((r) => [r.id, r]));
  const rows = picked.flatMap((id) => (byId.has(id) ? [byId.get(id) as TryRow] : []));
  return rows.length > 0 ? { year, moduleName, rows } : null;
}

/** The sample for one academic year (answers included), or null when that year is not offered. */
export async function loadTrySample(
  year: number,
  config: TryConfig = TRY_CONFIG
): Promise<TrySample | null> {
  const key = `${year}:${config.modules[year] ?? ''}:${config.questionCount}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
  const value = await loadUncached(year, config);
  cache.set(key, { at: Date.now(), value });
  return value;
}

/** Every offered year's sample, in year order. A year with nothing to show is left out. */
export async function loadTrySamples(config: TryConfig = TRY_CONFIG): Promise<TrySample[]> {
  const samples = await Promise.all(tryYears(config).map((year) => loadTrySample(year, config)));
  return samples.filter((s): s is TrySample => s !== null);
}

/** Forget cached samples (tests). */
export function clearTryCache(): void {
  cache.clear();
}

/** What the browser may see: the question and its choices, never the answer. */
export function toPublicQuestions(rows: TryRow[]): TryQuestion[] {
  return rows.map(({ id, question, choices }) => ({ id, question, choices }));
}
