import 'server-only';
import { chunk } from '@/lib/server/custom-exam';
import { publicDbError } from '@/lib/api-error';

/**
 * The one place a question's answer leaves the server (migration 049).
 *
 * Quiz payloads no longer carry the answer. A student gets it only after
 * answering that question, and every such moment is recorded in
 * `question_reveals`. Anything else that shows answers (resuming a quiz,
 * results, bookmarks, notes) goes through `gatedReveals`, which returns
 * ONLY questions already recorded for that student. All functions take a
 * service-role client (the table is server-only) and are scoped by the
 * caller's student id.
 */

export type Reveal = {
  correctAnswer: string;
  explanation: string;
  choiceRationales?: Record<string, string>;
  reference: string;
  referencePage: number | null;
};

type Db = { from: (table: string) => any };

const ID_CHUNK = 150;
const REVEAL_COLUMNS = 'id, correct_answer, explanation, choice_rationales, reference, reference_page';

type RevealRow = {
  id: number;
  correct_answer: string;
  explanation: string;
  choice_rationales: Record<string, string> | null;
  reference: string;
  reference_page: number | null;
};

export function toReveal(row: RevealRow): Reveal {
  return {
    correctAnswer: row.correct_answer,
    explanation: row.explanation,
    ...(row.choice_rationales ? { choiceRationales: row.choice_rationales } : {}),
    reference: row.reference,
    referencePage: row.reference_page,
  };
}

function uniqueInts(ids: number[]): number[] {
  return [...new Set(ids.filter((id) => Number.isInteger(id)))];
}

/** Reveal data for PUBLISHED questions. Does not check who may see it: use `gatedReveals`. */
export async function loadReveals(
  service: Db,
  ids: number[]
): Promise<{ reveals: Map<number, Reveal>; error: string | null }> {
  const reveals = new Map<number, Reveal>();
  for (const part of chunk(uniqueInts(ids), ID_CHUNK)) {
    const res = await service
      .from('questions')
      .select(REVEAL_COLUMNS)
      .in('id', part)
      .eq('status', 'published');
    if (res.error) return { reveals: new Map(), error: publicDbError(res.error) };
    for (const row of (res.data ?? []) as RevealRow[]) reveals.set(row.id, toReveal(row));
  }
  return { reveals, error: null };
}

/** Remember that these answers have been shown to this student. Idempotent. */
export async function recordReveals(
  service: Db,
  studentId: string,
  ids: number[]
): Promise<string | null> {
  const unique = uniqueInts(ids);
  if (unique.length === 0) return null;
  for (const part of chunk(unique, 500)) {
    const res = await service.from('question_reveals').upsert(
      part.map((question_id) => ({ student_id: studentId, question_id })),
      { onConflict: 'student_id,question_id', ignoreDuplicates: true }
    );
    if (res.error) return publicDbError(res.error);
  }
  return null;
}

/** The questions among `ids` whose answer was already shown to this student. */
export async function revealedIds(
  service: Db,
  studentId: string,
  ids: number[]
): Promise<{ ids: Set<number>; error: string | null }> {
  const shown = new Set<number>();
  for (const part of chunk(uniqueInts(ids), ID_CHUNK)) {
    const res = await service
      .from('question_reveals')
      .select('question_id')
      .eq('student_id', studentId)
      .in('question_id', part);
    if (res.error) return { ids: new Set(), error: publicDbError(res.error) };
    for (const row of (res.data ?? []) as { question_id: number }[]) shown.add(row.question_id);
  }
  return { ids: shown, error: null };
}

/** Reveal data for the questions among `ids` that were already shown to this student. */
export async function gatedReveals(
  service: Db,
  studentId: string,
  ids: number[]
): Promise<{ reveals: Map<number, Reveal>; error: string | null }> {
  const shown = await revealedIds(service, studentId, ids);
  if (shown.error) return { reveals: new Map(), error: shown.error };
  return loadReveals(service, [...shown.ids]);
}

/** A Map as a plain object keyed by question id, ready for JSON. */
export function revealsToJson(reveals: Map<number, Reveal>): Record<string, Reveal> {
  return Object.fromEntries([...reveals].map(([id, r]) => [String(id), r]));
}
