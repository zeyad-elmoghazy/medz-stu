import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/require-admin';
import { untypedFrom } from '@/lib/supabase-server';
import { applyRateLimit } from '@/lib/apply-rate-limit';
import { adminLimiter } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/questions/import
 *
 * Bulk-imports a production-artifact JSON batch (the exact shape a
 * content-production run outputs — see medz_vision_mcq_data.json)
 * into the Review Queue. Destination-first, same as admin/upload:
 * the caller supplies moduleCode + chapterId, and every question in
 * the batch lands under that one chapter.
 *
 * No book/document resolution here — the module already owns its
 * book (modules.book_id, see 019_module_book_and_import_idempotency.sql)
 * and reference_book_id is a dead column. This route only ever
 * writes reference_page, taken directly from each question's JSON
 * value.
 *
 * Upserts via questions.external_id (the source file's own
 * question_id, e.g. "VIS_Q001") so re-running an import updates
 * existing rows instead of duplicating them.
 *
 * PROVISIONAL: this route has only ever been exercised against one
 * example file (medz_vision_mcq_data.json) of unconfirmed
 * representativeness. Treat the normalization logic below as
 * provisional until a genuine first real import runs through it.
 */

const ImportQuestionSchema = z.object({
  question_id: z.string().min(1),
  stem: z.string().min(1),
  options: z.record(z.string(), z.string()).refine((o) => Object.keys(o).length >= 2, {
    message: 'options must have at least 2 entries',
  }),
  final_answer: z.string().min(1),
  explanation: z.string().optional().default(''),
  option_analysis: z
    .record(z.string(), z.object({ reason: z.string().optional() }).passthrough())
    .optional(),
  reference_page: z.number().int().min(1).optional(),
  // Pre-composed citation text (e.g. "Anatomy of Neuroscience
  // Textbook, p.2") — maps straight to questions.reference (TEXT,
  // already populated by every other write path; this route was the
  // one gap). Deliberately a single free-text field rather than
  // separate reference_document/reference_page inputs: source
  // batches don't always give a page number that reduces to one
  // int (e.g. "2 and 4"), so composing the final citation string is
  // left to whatever produces this JSON, not to this schema.
  reference: z.string().max(500).optional().default(''),
  // Explicitly NOT declared here (and therefore stripped by Zod's
  // default parse behavior, not stored anywhere): question_number,
  // answer_status, reference_status, scientific_review_required,
  // scientific_review_reason, suggested_answer, reference_document.
  // No ordering/sequence column exists on `questions` for
  // question_number to map onto — confirmed against the live schema
  // before dropping it.
});

const ImportRequestSchema = z.object({
  moduleCode: z.string().min(1),
  chapterId: z.string().uuid(),
  data: z.object({
    production_metadata: z.record(z.string(), z.unknown()).optional(),
    questions: z.array(ImportQuestionSchema).min(1),
    scientific_review_summary: z.record(z.string(), z.unknown()).optional(),
  }),
});

// Normalizes an inconsistent options dict (seen in real data: a-d,
// a-e, a-f, and both "a" and "A" casing) into the app's lowercase
// {id, text}[] choices shape. Order follows the source object's own
// key order (JSON preserves insertion order).
function normalizeChoices(options: Record<string, string>): { id: string; text: string }[] {
  return Object.entries(options).map(([key, text]) => ({
    id: key.trim().toLowerCase(),
    text,
  }));
}

export async function POST(request: NextRequest) {
  const { user, supabase, error } = await requireAdmin();
  if (error) return error;

  const limited = await applyRateLimit(request, adminLimiter, user.id);
  if (limited) return limited;

  const rawBody = await request.json().catch(() => null);
  const parsed = ImportRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const { moduleCode, chapterId, data } = parsed.data;

  // Resolve chapter -> subject slug + confirm it actually belongs to
  // the stated module (same distrust-of-client-input pattern
  // admin/upload uses for its own chapter resolution).
  const chapterRes = await untypedFrom(supabase)
    .from('chapters')
    .select('module_code, subject_id, subjects(slug)')
    .eq('id', chapterId)
    .single();
  if (chapterRes.error || !chapterRes.data) {
    return NextResponse.json({ error: 'Chapter not found' }, { status: 404 });
  }
  const chapter = chapterRes.data as {
    module_code: string;
    subject_id: string;
    subjects: { slug: string } | null;
  };
  if (chapter.module_code !== moduleCode) {
    return NextResponse.json(
      { error: `chapterId does not belong to module ${moduleCode}` },
      { status: 400 }
    );
  }
  const subjectSlug = chapter.subjects?.slug;
  if (!subjectSlug) {
    return NextResponse.json({ error: 'Chapter has no subject binding' }, { status: 500 });
  }

  // Resolve existing rows for this batch's external_ids up front so
  // subject_bundle_id (legacy NOT NULL + UNIQUE(subject_id,
  // subject_bundle_id)) is only ever freshly minted for genuinely
  // new rows — an update must keep its existing value, never have it
  // recomputed, or the upsert could collide with itself or another
  // row.
  const externalIds = data.questions.map((q) => q.question_id);
  const existingRes = await untypedFrom(supabase)
    .from('questions')
    .select('external_id, subject_bundle_id')
    .in('external_id', externalIds);
  if (existingRes.error) {
    return NextResponse.json({ error: existingRes.error.message }, { status: 500 });
  }
  const existingBundleIdByExternalId = new Map<string, number>(
    ((existingRes.data ?? []) as { external_id: string; subject_bundle_id: number }[]).map(
      (r) => [r.external_id, r.subject_bundle_id]
    )
  );

  const maxRes = await untypedFrom(supabase)
    .from('questions')
    .select('subject_bundle_id')
    .eq('subject_id', subjectSlug)
    .order('subject_bundle_id', { ascending: false })
    .limit(1);
  let nextBundleId =
    ((maxRes.data as { subject_bundle_id: number }[] | null)?.[0]?.subject_bundle_id ?? 0) + 1;

  const rows = data.questions.map((q) => {
    const choices = normalizeChoices(q.options);
    const correctAnswer = q.final_answer.trim().toLowerCase();

    const choiceRationales: Record<string, string> | null = q.option_analysis
      ? Object.fromEntries(
          Object.entries(q.option_analysis)
            .map(([key, val]) => [key.trim().toLowerCase(), val.reason])
            .filter(([, reason]) => typeof reason === 'string' && reason.length > 0)
        )
      : null;

    const subjectBundleId =
      existingBundleIdByExternalId.get(q.question_id) ?? nextBundleId++;

    return {
      external_id: q.question_id,
      subject_id: subjectSlug,
      subject_bundle_id: subjectBundleId,
      question: q.stem,
      choices,
      correct_answer: correctAnswer,
      explanation: q.explanation ?? '',
      choice_rationales:
        choiceRationales && Object.keys(choiceRationales).length > 0 ? choiceRationales : null,
      reference: q.reference ?? '',
      reference_page: q.reference_page ?? null,
      topic: '',
      chapter_id: chapterId,
      professor_id: user.id,
      status: 'under_review',
      source: 'ai',
      difficulty: 'medium',
    };
  });

  const { data: upserted, error: upsertError } = await untypedFrom(supabase)
    .from('questions')
    .upsert(rows, {
      onConflict: 'external_id',
    })
    .select('id, external_id');

  if (upsertError) {
    return NextResponse.json({ error: upsertError.message }, { status: 500 });
  }

  const result = (upserted ?? []) as { id: number; external_id: string }[];

  return NextResponse.json(
    {
      imported: result.length,
      questionIds: result.map((r) => r.id),
    },
    { status: 201 }
  );
}
