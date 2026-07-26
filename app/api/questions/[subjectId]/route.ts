import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@/lib/supabase-server';
import { withCache } from '@/lib/cache';
import { CACHE_KEYS, TTL } from '@/lib/redis';
import { histologyQuestions, type HistologyQuestion, type Choice } from '@/data/histology-questions';
import { isDemoMode, type Database } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/questions/[subjectId]
 *
 * Returns the full MCQ bank for a subject.
 *
 * Why a 24h TTL:
 *   Question banks are versioned, published artifacts. Once
 *   Dr. Zahra publishes a block, the 11 questions don't mutate
 *   for the rest of the term. The 24h TTL is a safety net — the
 *   editorial publish flow should call invalidateCache(
 *   CACHE_KEYS.questionBank(subjectId)) on every publish, which
 *   means cold lookups dominate and the TTL itself is rarely
 *   the eviction trigger.
 *
 * Why the cache pays off so much here:
 *   Every student starting the histology block hits this
 *   endpoint. For a cohort of 1k students opening the quiz over
 *   24h, this is the difference between 1k Postgres reads of a
 *   ~100KB payload and a single one served from Upstash.
 *
 * Auth:
 *   Requires a signed-in session. The bank itself is published
 *   material owned by faculty — exposing it anonymously would
 *   leak exam content to scrapers. Per-student answer history is
 *   gated separately by /api/student/stats.
 */
export async function GET(_request: NextRequest, props: { params: Promise<{ subjectId: string }> }) {
  const params = await props.params;
  const supabase = await createRouteHandlerClient<Database>({ cookies });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const subjectId = params.subjectId;

  const questions = await withCache(
    CACHE_KEYS.questionBank(subjectId),
    TTL.QUESTIONS,
    () => fetchQuestionsFromDB(subjectId)
  );

  return NextResponse.json({ subjectId, questions });
}

/**
 * Read questions from the source of truth (Supabase `questions`
 * table). In demo mode (NEXT_PUBLIC_DEMO=1) we fall back to the
 * bundled histology module so the UI still works without a
 * provisioned Supabase project.
 *
 * The response shape matches HistologyQuestion so the client and
 * the scoring path in /api/quiz/submit don't need to fork.
 */
type QuestionRow = {
  subject_bundle_id: number;
  question: string;
  choices: Choice[];
  correct_answer: string;
  explanation: string;
  choice_rationales: Record<string, string> | null;
  reference: string;
  topic: string;
  notes_storage_prefix: string | null;
  reference_page: number | null;
};

async function fetchQuestionsFromDB(subjectId: string): Promise<HistologyQuestion[]> {
  if (isDemoMode()) {
    return subjectId === 'histology' ? histologyQuestions : [];
  }

  const supabase = await createRouteHandlerClient<Database>({ cookies });

  // auth-helpers-nextjs@0.8 collapses the Database generic to
  // `never` for chained builders; the shape below is the exact
  // surface this query needs.
  const client = supabase as unknown as {
    from: (table: string) => {
      select: (cols: string) => {
        eq: (col: string, val: unknown) => {
          order: (
            col: string,
            opts: { ascending: boolean }
          ) => Promise<{ data: QuestionRow[] | null; error: { message: string } | null }>;
        };
      };
    };
  };

  const { data, error } = await client
    .from('questions')
    .select(
      'subject_bundle_id, question, choices, correct_answer, explanation, choice_rationales, reference, topic, notes_storage_prefix, reference_page'
    )
    .eq('subject_id', subjectId)
    .order('subject_bundle_id', { ascending: true });

  if (error) throw new Error(error.message);

  const { notesPageImageUrl } = await import('@/lib/ocr/notes-upload');

  return (data ?? []).map(
    (r): HistologyQuestion => ({
      id: r.subject_bundle_id,
      question: r.question,
      choices: r.choices,
      correctAnswer: r.correct_answer,
      explanation: r.explanation,
      choiceRationales: r.choice_rationales ?? undefined,
      reference: r.reference,
      topic: r.topic,
      referenceImageUrl:
        r.notes_storage_prefix && r.reference_page
          ? notesPageImageUrl(r.notes_storage_prefix, r.reference_page)
          : null,
    })
  );
}
