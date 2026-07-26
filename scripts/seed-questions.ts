/**
 * Seed the Supabase `questions` table from the bundled histology
 * question module. Idempotent — safe to re-run; existing rows are
 * left alone via ON CONFLICT.
 *
 * Usage:
 *   npm run seed:questions
 *
 * Env required:
 *   NEXT_PUBLIC_SUPABASE_URL      — the project URL
 *   SUPABASE_SERVICE_ROLE_KEY     — service role key (bypasses RLS
 *                                   so we can write the published
 *                                   bank without impersonating a
 *                                   professor)
 *
 * Adding another subject later:
 *   1. Export a bundle from data/<subject>-questions.ts using the
 *      same HistologyQuestion shape.
 *   2. Add an entry to BUNDLES below.
 *   3. Re-run this script.
 */

import { createClient } from '@supabase/supabase-js';
import { histologyQuestions, type HistologyQuestion } from '../data/histology-questions';

type Bundle = {
  subjectId: string;
  questions: HistologyQuestion[];
};

const BUNDLES: Bundle[] = [
  { subjectId: 'histology', questions: histologyQuestions },
];

async function main(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    // Fail loud — silent env misses are exactly how a "seed" ends
    // up pointing at the wrong project.
    throw new Error(
      'seed-questions: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.'
    );
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  for (const { subjectId, questions } of BUNDLES) {
    const rows = questions.map((q) => ({
      subject_id: subjectId,
      subject_bundle_id: q.id,
      question: q.question,
      choices: q.choices,
      correct_answer: q.correctAnswer,
      explanation: q.explanation,
      choice_rationales: q.choiceRationales ?? null,
      reference: q.reference,
      topic: q.topic,
    }));

    // upsert with ignoreDuplicates=true is the JS-client equivalent
    // of INSERT ... ON CONFLICT DO NOTHING against the composite
    // unique (subject_id, subject_bundle_id).
    const { error, count } = await supabase
      .from('questions')
      .upsert(rows, {
        onConflict: 'subject_id,subject_bundle_id',
        ignoreDuplicates: true,
        count: 'exact',
      });

    if (error) {
      throw new Error(
        `seed-questions: failed for subject "${subjectId}": ${error.message}`
      );
    }

    // eslint-disable-next-line no-console
    console.log(
      `seed-questions: ${subjectId} — ${rows.length} in bundle, ${count ?? '?'} written (existing rows skipped).`
    );
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
