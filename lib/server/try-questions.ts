import 'server-only';
import { serviceRoleClient } from '@/lib/supabase-service';
import { untypedFrom } from '@/lib/supabase-server';
import { TRY_CONFIG, type TryConfig } from '@/lib/try-config';

/**
 * The questions featured on the public /try page. The bank is service-role
 * only (migration 047), so this reads with the service role and keeps the
 * explicit status='published' filter.
 *
 * `loadTryRows` returns the answer key: it is for the check route. The page
 * must pass only `toPublicQuestions(rows)` to the browser.
 */

export type TryChoice = { id: string; text: string };
export type TryQuestion = { id: number; question: string; choices: TryChoice[] };
export type TryRow = TryQuestion & { correct_answer: string; explanation: string };

/** The featured questions with their answers, or null when /try is not configured or has none. */
export async function loadTryRows(config: TryConfig = TRY_CONFIG): Promise<TryRow[] | null> {
  if (!config.chapterId) return null;
  const { data, error } = await untypedFrom(serviceRoleClient())
    .from('questions')
    .select('id, question, choices, correct_answer, explanation')
    .eq('chapter_id', config.chapterId)
    .eq('status', 'published')
    .order('id', { ascending: true })
    .limit(config.questionCount);
  if (error) throw new Error(`[try] could not load the featured questions: ${error.message}`);
  const rows = (data ?? []) as TryRow[];
  return rows.length > 0 ? rows : null;
}

/** What the browser may see: the question and its choices, never the answer. */
export function toPublicQuestions(rows: TryRow[]): TryQuestion[] {
  return rows.map(({ id, question, choices }) => ({ id, question, choices }));
}
